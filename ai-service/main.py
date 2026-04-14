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
Focus on behavioral questions using the STAR method. Include questions about conflict resolution, leadership, adaptability, and performance in roles like Sales or Marketing (e.g., 'Tell me about a time you missed a target' or 'How do you handle a difficult client?').
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
- Ask only situational and behavioral questions
- Avoid all technical or coding questions
- Use STAR-style prompts where appropriate
- Evaluate emotional intelligence, communication, collaboration, leadership potential, adaptability, and cultural fit
- Technical jargon is prohibited unless it refers to general professional tools (for example CRM in sales contexts)
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
                "For HR roles, act as a professional Recruiter. Ask situational questions that evaluate emotional intelligence, "
                "communication, and cultural fit. Avoid all technical jargon unless it pertains to general professional tools "
                "(e.g., CRM for sales)."
            )

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

    temp_mp3_path = None
    
    try:
        try:
            audio_bytes = await file.read()
            if not audio_bytes:
                raise ValueError("Uploaded file is empty")
        except Exception as file_err:
            print(f"File Read Error: {file_err}")
            raise HTTPException(status_code=400, detail="Failed to read uploaded file")

        try:
            audio_memory = io.BytesIO(audio_bytes)
            try:
                audio_segment = AudioSegment.from_file(audio_memory, format="webm")
            except Exception:
                audio_memory.seek(0)
                try:
                    audio_segment = AudioSegment.from_file(audio_memory, format="ogg")
                except Exception:
                    audio_memory.seek(0)
                    audio_segment = AudioSegment.from_file(audio_memory)
        except Exception as audio_err:
            print(f"Audio Processing Error: {audio_err}")
            raise HTTPException(status_code=400, detail="Invalid audio format")

        if len(audio_segment) <= 0:
            raise HTTPException(status_code=422, detail="Uploaded audio is empty")

        print(f"Transcribing audio of length: {len(audio_segment)}ms")

        if not WHISPER_MODEL:
            whisper_device = "cuda" if torch and torch.cuda.is_available() else "cpu"
            WHISPER_MODEL = whisper.load_model("tiny.en", device=whisper_device)

        try:
            audio_segment = audio_segment.set_channels(1).set_frame_rate(16000)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_mp3:
                temp_mp3_path = tmp_mp3.name
                audio_segment.export(temp_mp3_path, format="mp3")

            result = WHISPER_MODEL.transcribe(temp_mp3_path, language="en", fp16=False)
            transcript_text = (result or {}).get("text", "").strip()
        except Exception as whisper_err:
            print(f"Whisper Transcription Error: {whisper_err}")
            raise HTTPException(status_code=500, detail="Transcription failed")

        if not transcript_text:
            raise HTTPException(status_code=422, detail="Transcription returned empty text")

        return {"transcription": transcript_text}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Transcribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_mp3_path and os.path.exists(temp_mp3_path):
            try:
                os.remove(temp_mp3_path)
            except Exception as cleanup_err:
                print(f"Cleanup error: {cleanup_err}")


# ---------------------------
# EVALUATE
# ---------------------------

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest):
    try:

        system_prompt = """
    You are a strict technical grader. Evaluate the Answer/Code against the Question.
    Return ONLY JSON in this format: {"score": <0-100>, "feedback": "<string>", "confidenceScore": <float>}.
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