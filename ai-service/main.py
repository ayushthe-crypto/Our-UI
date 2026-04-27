import uvicorn
import os
import io
import json
import re
import tempfile
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from dotenv import load_dotenv
from typing import Optional
import ollama
import whisper
from pydub import AudioSegment
from pydub.utils import which

try:
    import torch
except Exception:
    torch = None

load_dotenv()

AI_SERVICE_PORT = int(os.getenv("AI_SERVICE_PORT", 8000))
OLLAMA_MODEL_NAME = os.getenv("OLLAMA_MODEL_NAME", "mistral")

app = FastAPI(title="AI Interviewer Microservice", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------
# LOAD WHISPER MODEL
# ---------------------------

WHISPER_MODEL = None
WHISPER_MODEL_NAME = "tiny.en"

try:
    whisper_device = "cuda" if torch and torch.cuda.is_available() else "cpu"
    print(f"Loading Whisper Model ({WHISPER_MODEL_NAME}) on {whisper_device}...")
    WHISPER_MODEL = whisper.load_model(WHISPER_MODEL_NAME, device=whisper_device)
    print("Whisper Loaded")
except Exception as e:
    print(f"Whisper failed: {e}")

# ---------------------------
# REQUEST MODELS
# ---------------------------

class QuestionRequest(BaseModel):
    role: str = "Data Scientist"
    level: str = "Junior"
    count: int = 5
    interview_type: str = "coding-mix"
    language: str = "python"

    @validator("role")
    def validate_role(cls, value: str) -> str:
        role = value.strip()
        if not role:
            raise ValueError("Role must not be empty")
        return role


class QuestionResponse(BaseModel):
    questions: list[str]
    model_used: str


class EvaluationRequest(BaseModel):
    question: str
    question_type: str
    role: str
    level: str
    user_answer: Optional[str] = None
    user_code: Optional[str] = None


class EvaluationResponse(BaseModel):
    score: int
    feedback: str
    confidenceScore: float


# ---------------------------
# ROOT
# ---------------------------

@app.get("/")
async def root():
    try:
        return {"message": "AI Interviewer Running", "model": OLLAMA_MODEL_NAME}
    except Exception as e:
        print(f"Root endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------
# GENERATE QUESTIONS
# ---------------------------

@app.post("/generate-questions", response_model=QuestionResponse)
async def generate_questions(request: QuestionRequest):
    try:
        normalized_role = request.role.strip().lower()
        is_hr_role = normalized_role in {"hr", "behavioral", "hr/behavioral", "hr / behavioral"}
        behavioral_prefixes = (
            "Tell me about a time when",
            "Share an example where",
        )
        behavioral_categories = [
            ("Conflict Resolution", "Disagreements with teammates or difficult personalities."),
            ("Ownership", "Taking accountability for mistakes and failures."),
            ("Adaptability", "Handling tight deadlines and sudden project changes."),
            ("Initiative", "Taking lead on tasks and showing leadership."),
            ("Decision Making", "Making logical choices with limited info."),
        ]
        behavioral_question_patterns = {
            "Conflict Resolution": [
                "Tell me about a time when you had to resolve a disagreement with a teammate who saw the situation differently. What did you do and what happened next?",
                "Share an example where you dealt with a difficult personality on a team. How did you respond and what changed because of it?",
                "Tell me about a time when you helped turn a conflict into a productive working relationship. What actions did you take?",
            ],
            "Ownership": [
                "Tell me about a time when you made a mistake at work and had to own it. What did you do and what was the result?",
                "Share an example where you were responsible for a failure or missed outcome. How did you take accountability and recover?",
                "Tell me about a time when you noticed something was your responsibility even though it was inconvenient. What happened?",
            ],
            "Adaptability": [
                "Tell me about a time when a deadline changed suddenly and you had to adjust your plan. How did you handle it and what was the outcome?",
                "Share an example where a project changed direction at the last minute. What did you do to adapt and keep things moving?",
                "Tell me about a time when pressure was high and priorities shifted quickly. How did you stay effective?",
            ],
            "Initiative": [
                "Tell me about a time when you stepped in to lead a task or initiative before being asked. What did you do and what happened?",
                "Share an example where you took ownership of something outside your normal responsibilities. How did you approach it?",
                "Tell me about a time when you saw a gap, acted on it, and helped move the work forward. What was the result?",
            ],
            "Decision Making": [
                "Tell me about a time when you had to make a difficult decision with limited information. How did you think it through and what was the result?",
                "Share an example where you had competing options and had to choose a direction quickly. What factors did you weigh?",
                "Tell me about a time when the right choice was not obvious. How did you decide what to do and why?",
            ],
        }

        # Determine difficulty guidelines based on level
        difficulty_guidelines = {
            "Junior": """
- Focus on basic data structures (arrays, lists, dictionaries)
- Include fundamental algorithms (sorting, searching, loops)
- Simple syntax and concept validation
- Examples: "Write a function to find the mean of a list", "Implement a simple for-loop pattern", "Basic data cleaning operations"
""",
            "Mid": """
- Focus on intermediate algorithms and optimization techniques
- Include moderate system design concepts
- Data processing and manipulation at scale
- Examples: "Implement an efficient algorithm with O(n log n) complexity", "Optimize this slow data processing pipeline", "Design a caching strategy for repeated queries"
""",
            "Senior": """
- Focus on complex optimization and advanced system design
- Advanced data processing and architectures
- Performance profiling and scaling challenges
- Examples: "Design and implement a custom cross-validation loop for ML", "Architect a distributed cache system", "Optimize complex data transformation pipelines"
""",
            "HR": """
                Focus on universal behavioral questions using the STAR method. Use only these categories: Conflict Resolution, Ownership, Adaptability, Initiative, and Decision Making. Do not ask about HR policies, MBA concepts, or coding. Every question must begin with either "Tell me about a time when" or "Share an example where". Each question should describe a different real-life situation, stakeholder, pressure point, or outcome so the wording is unique every time.
"""
        }

        level_guidelines = difficulty_guidelines["HR"] if is_hr_role else difficulty_guidelines.get(request.level, difficulty_guidelines["Junior"])

        programming_languages = {
            "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "rust", "ruby", "php", "kotlin", "swift", "sql"
        }
        if is_hr_role:
            requested_language = (request.language or "").strip()
            if requested_language and requested_language.lower() not in programming_languages:
                effective_language = requested_language
            else:
                effective_language = "Professional English"
        else:
            effective_language = request.language

        # Build interview type specific prompt
        interview_type_instruction = ""
        if is_hr_role:
            interview_type_instruction = """
IMPORTANT FOR HR / BEHAVIORAL INTERVIEWS:
- Ask only universal behavioral or situational questions
- Do not ask about HR policies, MBA concepts, or coding
- Every question must begin with "Tell me about a time when" or "Share an example where"
- Use the STAR method and evaluate emotional intelligence, communication, collaboration, ownership, adaptability, and decision making
- Do not reuse the same wording or scenario across questions
- Technical jargon is prohibited unless it refers to general professional tools
"""
        elif request.interview_type == "coding-mix":
            interview_type_instruction = "When 'Coding Mix' is selected, provide a mix of theoretical and practical coding challenges. Ensure the coding questions are calibrated for a {request.level} {request.role} and explicitly mention the {request.language} the candidate should use."
        elif request.interview_type == "oral-only":
            interview_type_instruction = """
IMPORTANT FOR ORAL-ONLY INTERVIEWS:
- You MUST NOT ask the candidate to write code, functions, scripts, classes, pseudo-code, algorithms as code, or implementation details
- You MUST NOT use prompts like "Write a function", "Implement a script", "Code a solution", "Build a program", or anything similar
- Ask only about high-level concepts, architectural decisions, tradeoffs, reasoning, debugging approach, or situational problem-solving
- Prefer questions that probe understanding of theory, design judgment, and communication of thought process
- For a Data Scientist in oral mode, emphasize machine learning theory, statistical reasoning, data cleaning strategies, experimental design, model evaluation, bias-variance tradeoff, overfitting, p-values, hypothesis testing, and business case studies
- If a question mentions code concepts, it must stay conceptual and never request the candidate to produce code
"""

        role_instruction = f"You are a professional technical interviewer specializing in {request.role} interviews."
        if is_hr_role:
            role_instruction = (
                "For behavioral roles, act as a professional interviewer focused on universal behavioral competencies. Ask only situational questions that evaluate conflict resolution, ownership, adaptability, initiative, leadership, and decision making. Avoid HR policies, MBA concepts, coding, and all technical jargon unless it refers to general professional tools."
            )

        if is_hr_role:
            system_prompt = f"""
    You are a concise behavioral interviewer for {request.role}.
    Role: {request.role}
    Level: {request.level}
    Language: {effective_language}
    Interview type: {request.interview_type.upper()}
    Behavioral categories:
    - {behavioral_categories[0][0]}: {behavioral_categories[0][1]}
    - {behavioral_categories[1][0]}: {behavioral_categories[1][1]}
    - {behavioral_categories[2][0]}: {behavioral_categories[2][1]}
    - {behavioral_categories[3][0]}: {behavioral_categories[3][1]}
    - {behavioral_categories[4][0]}: {behavioral_categories[4][1]}
    Rules:
    - Return only interview questions, one per line, with no numbering or explanations.
    - Every question must start with exactly one of these prefixes: "Tell me about a time when" or "Share an example where".
    - Never ask about HR policies, MBA concepts, coding, technical implementation, or theoretical management frameworks.
    - Keep every question behavioral, specific, and aligned to the requested level.
    - Vary the scenario, people involved, pressure, and outcome so questions are unique and not copy-pasted.
    - If interview type is ORAL-ONLY, keep the question purely situational and conversational.
    """
        else:
            system_prompt = f"""
    You are a concise technical interviewer for {request.role}.
    Role: {request.role}
    Level: {request.level}
    Language: {effective_language}
    Interview type: {request.interview_type.upper()}
    Rules:
    - Return only interview questions, one per line, with no numbering or explanations.
    - Keep every question aligned to the requested level.
    - If role is HR or Behavioral, ask only behavioral or situational questions.
    - If interview type is ORAL-ONLY, ask only conceptual questions and never request code or implementation.
    - If asking coding questions, name the language explicitly.
    """

        user_prompt = f"""
Generate exactly {request.count} interview questions for a {request.level} {request.role}.
Interview Type: {request.interview_type}

Requirements:
- Calibrate each question for the {request.level} level
- Use {effective_language} as the communication language for the interview
- If role is HR or Behavioral, do not ask for code or technical implementation details
- Make questions specific, actionable, and relevant to {request.role}
- For {request.interview_type}, follow the mixing requirements specified in the system prompt
"""

        try:
            response = ollama.generate(
                model=OLLAMA_MODEL_NAME,
                prompt=user_prompt,
                system=system_prompt,
                options={"temperature": 0.6}
            )
        except Exception as ollama_err:
            print(f"Ollama Generation Error: {ollama_err}")
            raise HTTPException(status_code=500, detail=f"Ollama Error: {str(ollama_err)}")

        raw = response.get("response", "").strip()

        if not raw:
            raise Exception("Empty response from model")

        questions = [
            q.replace("-", "").strip()
            for q in raw.split("\n")
            if q.strip()
        ]

        if is_hr_role:
            safe_fallback_questions = []
            for category_name, _category_description in behavioral_categories:
                safe_fallback_questions.extend(behavioral_question_patterns[category_name])

            def build_behavioral_question(index: int) -> str:
                category_name, category_description = behavioral_categories[index % len(behavioral_categories)]
                category_variants = behavioral_question_patterns[category_name]
                variant_index = (index // len(behavioral_categories)) % len(category_variants)
                return category_variants[variant_index]

            sanitized_questions = []
            seen_questions = set()
            for index in range(request.count):
                if index < len(questions):
                    question = questions[index].strip()
                else:
                    question = ""

                lower_question = question.lower()
                has_disallowed_topic = any(
                    phrase in lower_question
                    for phrase in ("hr policy", "hr policies", "mba", "coding", "code", "technical implementation")
                )
                has_valid_prefix = question.startswith(behavioral_prefixes)
                is_duplicate = question and question.lower() in seen_questions

                if not question or has_disallowed_topic or not has_valid_prefix or is_duplicate:
                    question = build_behavioral_question(index)

                if question.lower() in seen_questions:
                    question = build_behavioral_question(index + 1)

                if not question.startswith(behavioral_prefixes):
                    question = f"{behavioral_prefixes[index % len(behavioral_prefixes)]} {question.lstrip()}".strip()

                if not question or any(phrase in question.lower() for phrase in ("hr policy", "hr policies", "mba", "coding", "code", "technical implementation")):
                    question = safe_fallback_questions[index % len(safe_fallback_questions)]

                sanitized_questions.append(question)
                seen_questions.add(question.lower())

            questions = sanitized_questions

        if len(questions) == 0:
            raise Exception("No questions generated")

        return QuestionResponse(
            questions=questions[:request.count],
            model_used=OLLAMA_MODEL_NAME
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Question generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------
# TRANSCRIBE
# ---------------------------

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    global WHISPER_MODEL

    temp_input_path = None
    temp_wav_path = None

    try:
        try:
            audio_bytes = await file.read()
            if not audio_bytes:
                raise ValueError("Uploaded file is empty")
        except Exception as file_err:
            print(f"File Read Error: {file_err}")
            raise HTTPException(status_code=400, detail="Failed to read uploaded file")

        print(f"Received audio: {len(audio_bytes)} bytes, content_type={file.content_type}")

        suffix = ".webm"
        audio_format = "webm"
        if file.content_type:
            if "ogg" in file.content_type:
                suffix = ".ogg"
                audio_format = "ogg"
            elif "mp4" in file.content_type or "m4a" in file.content_type:
                suffix = ".mp4"
                audio_format = "mp4"
            elif "wav" in file.content_type:
                suffix = ".wav"
                audio_format = "wav"
            elif "webm" in file.content_type:
                suffix = ".webm"
                audio_format = "webm"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_in:
            tmp_in.write(audio_bytes)
            temp_input_path = tmp_in.name

        ffmpeg_path = which("ffmpeg")
        if not ffmpeg_path:
            raise HTTPException(status_code=500, detail="ffmpeg is not installed or not available on PATH")

        AudioSegment.converter = ffmpeg_path
        print(f"Using ffmpeg at: {ffmpeg_path}")

        try:
            audio_segment = AudioSegment.from_file(temp_input_path, format=audio_format)
        except Exception as audio_err:
            print(f"Audio decode failed: {audio_err}")
            raise HTTPException(status_code=400, detail="Audio conversion failed. Ensure ffmpeg is installed.")

        if len(audio_segment) == 0:
            raise HTTPException(status_code=400, detail="Empty audio")

        temp_wav_path = temp_input_path.replace(suffix, "_converted.wav")
        try:
            audio_segment.export(temp_wav_path, format="wav")
        except Exception as export_err:
            print(f"Audio export failed: {export_err}")
            raise HTTPException(status_code=400, detail="Audio conversion failed. Ensure ffmpeg is installed.")

        if not os.path.exists(temp_wav_path) or os.path.getsize(temp_wav_path) == 0:
            raise HTTPException(status_code=400, detail="Converted WAV file is empty")

        print(f"Converted WAV size: {os.path.getsize(temp_wav_path)} bytes")

        if os.path.getsize(temp_wav_path) < 5000:
            print("Audio too small - likely silent")
            return {"transcription": ""}

        if not WHISPER_MODEL:
            whisper_device = "cuda" if torch and torch.cuda.is_available() else "cpu"
            print(f"Loading Whisper model on {whisper_device}...")
            WHISPER_MODEL = whisper.load_model(WHISPER_MODEL_NAME, device=whisper_device)

        try:
            print("Starting Whisper transcription...")
            result = WHISPER_MODEL.transcribe(
                temp_wav_path,
                language="en",
                fp16=False,
                condition_on_previous_text=False,
                verbose=True,
                temperature=0,
                no_speech_threshold=0.6,
                logprob_threshold=-1.0,
            )
            transcript_text = (result or {}).get("text", "").strip()
            print("TRANSCRIPTION RESULT RAW:", result)
            print("FINAL TEXT:", transcript_text)
            print("Whisper transcription completed.")
        except Exception as whisper_err:
            print(f"Whisper Transcription Error: {whisper_err}")
            raise HTTPException(status_code=500, detail="Transcription failed")

        print(f"Transcript: '{transcript_text}'")

        if not transcript_text:
            print("Whisper returned empty transcription (silence or unclear audio).")
            return {"transcription": ""}

        return {"transcription": transcript_text}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Transcribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for path in [temp_input_path, temp_wav_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as cleanup_err:
                    print(f"Cleanup error: {cleanup_err}")


# ---------------------------
# EVALUATE
# ---------------------------

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest):
    try:
        normalized_role = request.role.strip().lower()
        is_behavioral_role = normalized_role in {"hr", "behavioral", "hr/behavioral", "hr / behavioral"}

        if is_behavioral_role:
            system_prompt = """
    You are a strict behavioral interviewer evaluator. Evaluate the Answer against the Question.
    Return ONLY JSON in this format: {"score": <0-100>, "feedback": "<string>", "confidenceScore": <float>}.
    The score must be an integer from 0 to 100.
    Instruction: Evaluate behavioral answers strictly based on the STAR method (Situation, Task, Action, Result). A high score requires a specific context (S/T), exact actions taken (A), and a clear outcome (R). Penalize theoretical, generic, policy-based, or story-free answers.
    Scoring rubric:
    - 90-100: Clear STAR structure with specific situation, task, actions, and measurable or concrete result.
    - 70-89: Mostly STAR-based with minor gaps in context, actions, or outcome.
    - 40-69: Partially specific but missing one or more STAR elements.
    - 0-39: Vague, theoretical, generic, or missing major STAR components.
    Feedback requirements:
    - Be detailed and actionable.
    - Mention what was good, what was missing, and exactly how to improve.
    - Keep feedback specific to the question and provided answer.
    """
        else:
            system_prompt = """
    You are a strict technical grader. Evaluate the Answer/Code against the Question.
    Return ONLY JSON in this format: {"score": <0-100>, "feedback": "<string>", "confidenceScore": <float>}.
    The score must be an integer from 0 to 100.
    Scoring rubric:
    - 90-100: Complete, accurate, specific, and well-reasoned answer.
    - 70-89: Mostly correct with minor gaps.
    - 40-69: Partially correct, missing key steps/details.
    - 0-39: Incorrect, vague, off-topic, or too shallow.
    Feedback requirements:
    - Be detailed and actionable.
    - Mention what was good, what was missing, and exactly how to improve.
    - Keep feedback specific to the question and provided answer/code.
    """

        user_prompt = f"""
Role: {request.role}
Level: {request.level}

Question:
{request.question}

Answer:
{request.user_answer}

Code:
{request.user_code}
"""

        response = ollama.generate(
            model=OLLAMA_MODEL_NAME,
            prompt=user_prompt,
            system=system_prompt,
            options={"temperature": 0.1}
        )

        text = response.get("response", "").strip()

        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if not json_match:
            print(f"Evaluation parse error: no JSON object found in model output: {text}")
            raise ValueError("Model did not return a JSON object")

        data = json.loads(json_match.group(0))

        raw_score = data.get("score", 0)
        try:
            score = float(raw_score)
        except (TypeError, ValueError):
            score = 0.0

        if 0 <= score <= 10:
            score *= 10

        answer_text = (request.user_answer or "").strip()
        code_text = (request.user_code or "").strip()

        # Deterministic guardrails for oral responses to reduce inflated scores.
        if not answer_text and not code_text:
            score = 0.0

        if request.question_type == "oral" and answer_text:
            answer_word_count = len(re.findall(r"\b\w+\b", answer_text))
            if answer_word_count < 8:
                score = min(score, 25.0)
            elif answer_word_count < 20:
                score = min(score, 45.0)
            elif answer_word_count < 35:
                score = min(score, 65.0)

            stop_words = {
                "the", "is", "are", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "at", "by", "from", "that", "this", "it", "as", "be", "was", "were", "i", "you", "we", "they", "he", "she"
            }
            question_tokens = {
                token for token in re.findall(r"\b[a-zA-Z]{3,}\b", request.question.lower()) if token not in stop_words
            }
            answer_tokens = {
                token for token in re.findall(r"\b[a-zA-Z]{3,}\b", answer_text.lower()) if token not in stop_words
            }

            if question_tokens:
                overlap_ratio = len(question_tokens & answer_tokens) / len(question_tokens)
                if overlap_ratio < 0.08:
                    score = min(score, 35.0)
                elif overlap_ratio < 0.15:
                    score = min(score, 55.0)

        score = max(0, min(100, int(round(score))))

        feedback = str(data.get("feedback", "No feedback")).strip()
        if len(feedback) < 80:
            feedback = (
                "Assessment: The response is not detailed enough for the asked question. "
                "What is good: There is at least an attempt to answer. "
                "What is missing: Concrete context, clear actions, decision rationale, and measurable outcomes. "
                "How to improve: Use a structured STAR-style response with specific steps, tools used, and the final result."
            )

        return EvaluationResponse(
            score=score,
            feedback=feedback,
            confidenceScore=float(data.get("confidenceScore", 0.0))
        )

    except Exception as e:
        print("Evaluation error:", e)
        if 'text' in locals() and text:
            print(f"Raw evaluation output: {text}")

        return EvaluationResponse(
            score=0,
            feedback="Evaluation failed",
            confidenceScore=0.0
        )


# ---------------------------
# RUN SERVER
# ---------------------------

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=AI_SERVICE_PORT)