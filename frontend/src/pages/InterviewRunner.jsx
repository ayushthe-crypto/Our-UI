// frontend/src/pages/InterviewRunner.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { getSessionById, submitAnswer, endSession } from '../features/sessions/sessionSlice';
import MonacoEditor from '@monaco-editor/react';
import { toast } from 'react-toastify';

// only python is relevant for data science interviews
const SUPPORTED_LANGUAGES = [
  { label: 'Python', value: 'python' }
];

// mapping only the remaining supported role
const ROLE_LANGUAGE_MAP = {
  "Data Scientist": "python"
};
function InterviewRunner() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { activeSession, isLoading, message } = useSelector(state => state.sessions);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // always use python since only Data Scientist role remains
  const [selectedLanguage, setSelectedLanguage] = useState('python');


  const [submittedLocal, setSubmittedLocal] = useState({});

  const [isTerminated, setIsTerminated] = useState(false);

  const [drafts, setDrafts] = useState(() => {
    const saved = localStorage.getItem(`drafts_${sessionId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Remove any audioBlob from loaded data since Blobs can't be serialized
      Object.keys(parsed).forEach(key => {
        if (parsed[key] && typeof parsed[key] === 'object') {
          delete parsed[key].audioBlob;
        }
      });
      return parsed;
    }
    return {};
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    if (activeSession?.role) {
      const detectedLang =
        ROLE_LANGUAGE_MAP[activeSession.role] || "plaintext";

      setSelectedLanguage(detectedLang);
    }
  }, [activeSession?.role]);


  useEffect(() => {
    const draftsToSave = Object.keys(drafts).reduce((acc, key) => {
      acc[key] = { code: drafts[key]?.code || '' };
      return acc;
    }, {});
    localStorage.setItem(`drafts_${sessionId}`, JSON.stringify(draftsToSave));
  }, [drafts, sessionId]);

  useEffect(() => {
    dispatch(getSessionById(sessionId));
  }, [dispatch, sessionId]);

  // Timeout to reset stuck submissions
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      Object.keys(submittedLocal).forEach(index => {
        const idx = parseInt(index);
        const question = activeSession?.questions?.[idx];
        if (submittedLocal[idx] && question && !question.isEvaluated) {
          console.warn(`Resetting stuck submission for question ${idx}`);
          setSubmittedLocal(prev => ({ ...prev, [idx]: false }));
          toast.error("Audio transcription timed out. Please try submitting again.");
        }
      });
    }, 30000); // 30 seconds

    return () => clearTimeout(timeoutId);
  }, [submittedLocal, activeSession?.questions]);

  // Strict Focus Mode: Proctoring feature
  useEffect(() => {
    const isInterviewActive = !!activeSession && !isTerminated;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isInterviewActive) {
        setIsTerminated(true);
        if (isRecording) {
          stopRecording();
        }
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        dispatch(endSession({ sessionId }));
        navigate('/dashboard?error=unethical_behavior');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeSession, isTerminated, dispatch, sessionId, navigate]);

  const currentQuestion = activeSession?.questions?.[currentQuestionIndex];


  // 1. Is it submitted in Redux? (Backend confirmed)
  const isReduxSubmitted = currentQuestion?.isSubmitted === true;

  // 2. Did I just click submit locally? (Optimistic update)
  const isLocallySubmitted = submittedLocal[currentQuestionIndex] === true;

  // 3. Lock if EITHER is true
  const isQuestionLocked = isReduxSubmitted || isLocallySubmitted;

  // 4. Show "Analyzing..." status if Locked AND not yet evaluated
  const isProcessing = isQuestionLocked && !currentQuestion?.isEvaluated;


  const handleNavigation = (index) => {
    if (index >= 0 && index < activeSession?.questions.length) {
      if (isRecording) stopRecording();
      setCurrentQuestionIndex(index);
      setRecordingTime(0);
    }
  };

  const updateDraftCode = (newCode) => {
    if (isQuestionLocked) return;
    setDrafts(prev => ({
      ...prev,
      [currentQuestionIndex]: { ...prev[currentQuestionIndex], code: newCode }
    }));
  };

  const startRecording = async () => {
    if (isQuestionLocked) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      timerIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch (err) {
      toast.error("Microphone denied.");
    }
  };

  const stopRecording = () => {
    return new Promise((resolve) => {
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
          setDrafts(prev => ({
            ...prev,
            [currentQuestionIndex]: { ...prev[currentQuestionIndex], audioBlob: blob }
          }));
          resolve(blob);
        };
        mediaRecorderRef.current.stop();
        streamRef.current?.getTracks().forEach(track => track.stop());
        clearInterval(timerIntervalRef.current);
        setIsRecording(false);
      } else {
        resolve(null);
      }
    });
  };

  const handleSubmitAnswer = async () => {
    if (isQuestionLocked) return;
    if (isRecording) {
      await stopRecording();
    }

    const draft = drafts[currentQuestionIndex];
    const code = draft?.code || '';
    const audio = draft?.audioBlob instanceof Blob ? draft.audioBlob : null;

    if (!code && !audio) {
      toast.warning("Please provide code or an audio answer.");
      return;
    }

    // ✅ 1. OPTIMISTIC UPDATE: Lock UI instantly
    setSubmittedLocal(prev => ({ ...prev, [currentQuestionIndex]: true }));

    const formData = new FormData();
    formData.append('questionIndex', currentQuestionIndex);
    if (code) formData.append('code', code);
    if (audio instanceof Blob) {
      console.log("Audio Blob Size:", audio.size);
      if (audio.size === 0) {
        toast.error("Audio recording failed. Please try again.");
        setSubmittedLocal(prev => ({ ...prev, [currentQuestionIndex]: false }));
        return;
      }
      formData.append('audioFile', audio, 'answer.webm');
    }

    // ✅ 2. Send Request
    dispatch(submitAnswer({ sessionId, formData }))
      .unwrap()
      .catch((err) => {
        // If backend fails, UNLOCK so user can try again
        setSubmittedLocal(prev => ({ ...prev, [currentQuestionIndex]: false }));
        const msg = err || "Submission failed. Please try again.";
        toast.error(msg);
      });
  };

  const handleFinishInterview = () => {
    if (!window.confirm("Are you sure you want to finish?")) return;

    // ✅ VALIDATION: Ensure sessionId is valid
    if (!sessionId || typeof sessionId !== 'string') {
      console.error("Invalid sessionId:", sessionId);
      toast.error("Error: Invalid session ID. Cannot finish interview.");
      return;
    }

    console.log("Ending session with ID:", sessionId);

    dispatch(endSession({ sessionId }))
      .unwrap()
      .then(() => {
        localStorage.removeItem(`drafts_${sessionId}`);
        navigate(`/review/${sessionId}`);
      })
      .catch(err => {
        console.error("Error ending session:", err);
        toast.error(err || "Could not finish session. Please try again.");
      });
  };

  if (!activeSession) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  const currentDraft = drafts[currentQuestionIndex] || {};
  const isOralOnly = activeSession?.interviewType === "oral-only";
  const isCodingMix = activeSession?.interviewType === "coding-mix";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-32">
      <div className="flex justify-between items-center bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 mb-6">
        <div>
          <h1 className="text-xl font-black text-teal-400">{activeSession.role}</h1>
          <div className="flex gap-2 mt-2">
            {activeSession?.questions?.map((q, i) => (
              <div
                key={i}
                onClick={() => handleNavigation(i)}
                className={`w-3 h-3 rounded-full cursor-pointer transition-all ${i === currentQuestionIndex ? 'bg-teal-600 scale-125 ring-2 ring-teal-200' :
                  q.isEvaluated ? 'bg-teal-500' :
                    (q.isSubmitted || submittedLocal[i]) ? 'bg-teal-400 animate-pulse' : 'bg-white/20'
                  }`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={handleFinishInterview}
          disabled={isLoading}
          className="bg-red-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-red-600 disabled:opacity-50"
        >
          {isLoading ? "Finalizing..." : "Finish Interview"}
        </button>
      </div>

      <div className="bg-white/5 backdrop-blur-md text-white p-8 rounded-2xl border border-white/10 mb-6">
        <span className="text-blue-400 text-xs font-bold uppercase tracking-widest">Question {currentQuestionIndex + 1}</span>
        <h2 className="text-2xl mt-2 font-bold font-sans leading-relaxed">{currentQuestion?.questionText}</h2>
      </div>

      <div className={`grid gap-6 ${isOralOnly || isCodingMix ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {!isCodingMix && (
          <div className={`bg-white/5 backdrop-blur-md p-6 rounded-xl border border-white/10 shadow-sm flex flex-col items-center justify-center ${isOralOnly ? 'min-h-[400px]' : 'min-h-[300px]'}`}>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Verbal Answer</h3>

            {!isRecording && !currentDraft.audioBlob ? (
              <button
                onClick={startRecording}
                disabled={isQuestionLocked}
                className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                🎤
              </button>
            ) : isRecording ? (
              <div className="text-center">
                <div className="w-20 h-20 bg-rose-500 rounded-full flex items-center justify-center animate-pulse text-white text-3xl cursor-pointer" onClick={stopRecording}>
                  ⏹
                </div>
                <p className="mt-4 font-mono text-rose-500 font-bold">{recordingTime}s</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-emerald-500 font-bold text-lg mb-2">Audio Captured ✅</div>
                {!isQuestionLocked && (
                  <button onClick={() => setDrafts(prev => ({ ...prev, [currentQuestionIndex]: { ...prev[currentQuestionIndex], audioBlob: null } }))} className="text-xs text-slate-400 underline hover:text-rose-500">
                    Delete & Re-record
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!isOralOnly && (
          <div className="bg-white/5 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-sm overflow-hidden h-[400px]">
            <div className="flex justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase py-2">Code Editor</span>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                disabled={isQuestionLocked}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {SUPPORTED_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <MonacoEditor
              height="100%"
              language={selectedLanguage}
              theme="vs-dark"
              value={currentDraft.code || ''}
              onChange={updateDraftCode}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                readOnly: isQuestionLocked,
                domReadOnly: isQuestionLocked
              }}
            />
          </div>
        )}
      </div>

      {currentQuestion?.isEvaluated && (
        <div className="mt-6 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 p-6 rounded-2xl animate-in fade-in slide-in-from-bottom-4">
          <h3 className="text-emerald-300 font-bold mb-2">💡 AI Feedback</h3>
          <p className="text-emerald-200 text-sm leading-relaxed">{currentQuestion.aiFeedback}</p>
          <div className="mt-4 flex gap-4">
            <span className="bg-emerald-500/20 px-3 py-1 rounded-lg text-xs font-bold text-emerald-300 shadow-sm">Score: {currentQuestion.technicalScore}/100</span>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/5 backdrop-blur-md border-t border-white/10 p-4 px-6 md:px-12 flex justify-between items-center z-50">
        <button
          onClick={() => handleNavigation(currentQuestionIndex - 1)}
          disabled={currentQuestionIndex === 0}
          className="text-white/70 font-bold text-sm hover:text-white disabled:opacity-30"
        >
          ← Previous
        </button>

        <div className="flex flex-col items-center">
          {/* ✅ STATUS BAR: Shows if Locked but not Evaluated yet */}
          {isProcessing && message && (
            <div className="mb-2 text-xs font-mono text-blue-300 bg-blue-500/20 backdrop-blur-sm px-3 py-1 rounded-full animate-pulse border border-blue-500/30">
              🤖 {message}...
            </div>
          )}

          <button
            onClick={handleSubmitAnswer}
            disabled={isQuestionLocked}
            className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all ${isProcessing ? 'bg-slate-400 cursor-wait' :
              currentQuestion?.isEvaluated ? 'bg-teal-500' :
                isQuestionLocked ? 'bg-slate-400' :
                  'bg-teal-500 hover:bg-teal-600 active:scale-95'
              }`}
          >
            {isProcessing ? "Analyzing..." : currentQuestion?.isEvaluated ? "Answer Submitted" : isQuestionLocked ? "Submitted" : "Submit Answer"}
          </button>
        </div>

        <button
          onClick={() => handleNavigation(currentQuestionIndex + 1)}
          disabled={currentQuestionIndex === activeSession.questions.length - 1}
          className="text-white/70 font-bold text-sm hover:text-white disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default InterviewRunner;