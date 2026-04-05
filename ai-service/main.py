import uvicorn
import os
import io
import json
import tempfile
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional
import ollama
import whisper
from pydub import AudioSegment

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

try:
    print("Loading Whisper Model...")
    WHISPER_MODEL = whisper.load_model("base.en")
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
        system_prompt = """
You are a professional technical interviewer.

Generate interview questions.

Rules:
- Return only questions
- No numbering
- No explanations
- One question per line
"""

        user_prompt = f"""
Generate {request.count} interview questions for a {request.level} {request.role}.
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
    temp_path = None
    
    try:
        try:
            audio_bytes = await file.read()
        except Exception as file_err:
            print(f"File Read Error: {file_err}")
            raise HTTPException(status_code=400, detail="Failed to read uploaded file")

        try:
            audio_memory = io.BytesIO(audio_bytes)
            audio_segment = AudioSegment.from_file(audio_memory)
        except Exception as audio_err:
            print(f"Audio Processing Error: {audio_err}")
            raise HTTPException(status_code=400, detail="Invalid audio format")

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
                temp_path = tmp.name
                audio_segment.export(temp_path, format="mp3")
        except Exception as export_err:
            print(f"Audio Export Error: {export_err}")
            raise HTTPException(status_code=500, detail="Failed to process audio")

        if not WHISPER_MODEL:
            raise HTTPException(status_code=503, detail="Whisper not loaded")

        try:
            result = WHISPER_MODEL.transcribe(temp_path)
        except Exception as whisper_err:
            print(f"Whisper Transcription Error: {whisper_err}")
            raise HTTPException(status_code=500, detail="Transcription failed")

        return {"transcription": result["text"].strip()}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Transcribe error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as cleanup_err:
                print(f"Cleanup error: {cleanup_err}")


# ---------------------------
# EVALUATE
# ---------------------------

@app.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(request: EvaluationRequest):
    try:

        system_prompt = """
You are a strict technical interviewer.

Return ONLY JSON.

Example:
{
"score": 7,
"feedback": "Good explanation but missing edge cases.",
"confidenceScore": 0.8
}
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

        # remove markdown if model returns ```json
        text = text.replace("```json", "").replace("```", "").strip()

        data = json.loads(text)

        return EvaluationResponse(
            score=int(data.get("score", 0)),
            feedback=str(data.get("feedback", "No feedback")),
            confidenceScore=float(data.get("confidenceScore", 0.0))
        )

    except Exception as e:
        print("Evaluation error:", e)

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