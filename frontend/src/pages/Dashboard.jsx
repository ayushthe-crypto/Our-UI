import { useState, useEffect } from "react"
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createSession, getSessions, reset, deleteSession } from '../features/sessions/sessionSlice'
import { logout as authLogout, reset as authReset } from '../features/auth/authSlice'
import { toast } from 'react-toastify'
import SessionCard from "../components/SessionCard"

// Supported interview roles
const ROLES = [
  "Data Scientist",
  "HR/Behavioral"
];

const ROLE_DESCRIPTIONS = {
  "Data Scientist": "Detailed data science interview with monitoring and case study support.",
  "HR/Behavioral": "Behavioral and situational interview focused on communication, culture fit, leadership, conflict resolution, and adaptability."
};
const LEVELS = ["Junior", "Mid-Level", "Senior"];
const TYPES = [{ label: 'Oral only', value: 'oral-only' }, { label: 'Coding Mix', value: 'coding-mix' }];
const COUNTS = [5, 10, 15];
const tips = [
  "Explain your thought process clearly in every answer.",
  "Start with brute force, then optimize step by step.",
  "Always ask clarifying questions before solving.",
  "Use STAR method for behavioral answers.",
  "Think out loud — silence is your enemy in interviews.",
  "Practice edge cases before finalizing code.",
  "Communicate trade-offs in system design.",
  "Keep answers structured and concise.",
  "Mock interviews improve confidence drastically.",
  "Focus on problem-solving, not just syntax.",
  "Revisit mistakes — that’s where real growth happens.",
  "Time yourself while solving DSA questions.",
  "Be honest if you don’t know something.",
  "Confidence + clarity = strong impression."
];

const Dashboard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useSelector((state) => state.auth);
  const { sessions, isLoading, isGenerating, isError, message } = useSelector((state) => state.sessions);
  const isProcessing = isGenerating;
  const dayIndex = new Date().getDate() % tips.length;
  const [tipIndex, setTipIndex] = useState(dayIndex);
  const [isFading, setIsFading] = useState(false);
  const [violationAlert, setViolationAlert] = useState('');

  const nextTip = () => {
    setIsFading(true);
    setTimeout(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
      setIsFading(false);
    }, 220);
  };

  const [formData, setFormData] = useState({
    // if stored role is not in allowed list, fallback to the single available one
    role: ROLES.includes(user.preferredRole) ? user.preferredRole : ROLES[0],
    level: LEVELS[0],
    interviewType: TYPES[1].value,
    count: COUNTS[0],
  });

  // Auto-select "Oral only" when HR/Behavioral is chosen
  useEffect(() => {
    if (formData.role === "HR/Behavioral") {
      setFormData(prev => ({
        ...prev,
        interviewType: 'oral-only'
      }));
    }
  }, [formData.role]);

  const completedSessions = sessions.filter((session) => typeof session.overallScore === 'number');
  const sessionsCompleted = sessions.filter((session) => session.status === 'completed').length;
  const averageScore = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((sum, session) => sum + session.overallScore, 0) / completedSessions.length)
    : 0;
  const overallProgress = averageScore > 100 ? 100 : averageScore;
  const averageTechnical = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((sum, session) => sum + (session.metrics?.avgTechnical || 0), 0) / completedSessions.length)
    : 0;
  const averageConfidence = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((sum, session) => sum + (session.metrics?.avgConfidence || 0), 0) / completedSessions.length)
    : 0;

  useEffect(() => {
    dispatch(getSessions());
  }, [dispatch]);

  useEffect(() => {
    if (isError && message) {
      toast.error(message);
      dispatch(reset());
    }
  }, [isError, message, dispatch]);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'unethical_behavior') {
      setViolationAlert('Session Terminated: Unfair means or unethical behavior was detected during your interview.');
      toast.error('Session Terminated: Unfair means or unethical behavior was detected during your interview.');
      navigate('/dashboard', { replace: true });
    }
  }, [searchParams, navigate]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: name === 'count' ? parseInt(value, 10) : value
    }));
  }

  const onSubmit = (e) => {
    e.preventDefault();
    dispatch(createSession(formData));
  }

  const onLogout = () => {
    dispatch(authLogout());
    dispatch(authReset());
    navigate('/login');
  }

  const scrollToHistory = () => {
    const section = document.getElementById('dashboard-history-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const viewSession = (session) => {
    if (session.status === 'completed') {
      navigate(`/review/${session._id}`);
    } else if(session.status === 'in-progress') {
      navigate(`/interview/${session._id}`);
    }else{
      toast.info('Session not ready yet')
    }
  }


  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this session?')) {
      dispatch(deleteSession(sessionId));
      toast.error('Session Deleted')
    }
  }



  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8 text-slate-100">
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-6 rounded-[28px] border border-white/10 bg-slate-900/70 shadow-xl shadow-slate-950/40 backdrop-blur-xl p-6">
          <div className="mt-6 space-y-2">
            <div className="mt-6 rounded-2xl border border-teal-400/10 bg-slate-950/70 p-4 shadow-[0_0_35px_rgba(16,185,129,0.06)] backdrop-blur-xl">
              <div className="flex items-center gap-2 text-teal-300 mb-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-200">💡</span>
                <h3 className="text-sm font-black uppercase tracking-[0.25em]">Daily AI Tip</h3>
              </div>
              <p className={`text-sm leading-6 text-slate-300 transition-opacity duration-300 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                {tips[tipIndex]}
              </p>
              <button
                type="button"
                onClick={nextTip}
                className="mt-4 inline-flex items-center justify-center rounded-2xl border border-teal-400/20 bg-teal-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-200 transition hover:bg-teal-500/15"
              >
                Next Tip
              </button>
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          {violationAlert && (
            <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-100 shadow-lg shadow-rose-500/10">
              <p className="text-sm font-semibold">{violationAlert}</p>
            </div>
          )}
          <section className="rounded-[32px] border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-teal-400/70">Welcome back</p>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Welcome, <span className="text-teal-300">{user.name.split(' ')[0]}</span></h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">Your central tech prep hub. Review sessions, launch a new interview, and track progress from the dashboard.</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-slate-800/70 px-5 py-4 text-center shadow-inner shadow-slate-950/20">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Total Sessions</p>
                <p className="mt-3 text-4xl font-black text-teal-300">{sessions.length}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <article className="rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Overall Progress</p>
                  <p className="mt-3 text-2xl font-black text-white">{overallProgress}%</p>
                </div>
                <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-slate-800/70 border border-white/10">
                  <svg viewBox="0 0 120 120" className="h-28 w-28">
                    <circle cx="60" cy="60" r="50" className="stroke-slate-700/80" strokeWidth="12" fill="none" />
                    <circle cx="60" cy="60" r="50" className="stroke-teal-400" strokeWidth="12" fill="none" strokeDasharray="314" strokeDashoffset={`${314 - (overallProgress / 100) * 314}`} strokeLinecap="round" transform="rotate(-90 60 60)" />
                  </svg>
                  <span className="absolute text-sm font-bold text-white">{overallProgress}%</span>
                </div>
              </div>
              <div className="mt-6 space-y-2 text-sm text-slate-400">
                <p>Sessions Completed: {sessionsCompleted}</p>
                <p>Avg Score: {overallProgress}%</p>
                <p>Next Level Prep: 3 Sessions away</p>
              </div>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Total Sessions</p>
              <p className="mt-4 text-5xl font-black text-white">{sessions.length}</p>
              <div className="mt-5 rounded-3xl bg-slate-800/80 p-4">
                <p className="text-sm text-slate-400">Sessions in progress and completed</p>
              </div>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Interview Goals</p>
              <div className="mt-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>Technical Skills</span>
                    <span>{averageTechnical}%</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-teal-400" style={{ width: `${averageTechnical}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>Behavioral Skills</span>
                    <span>{averageConfidence}%</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-teal-400" style={{ width: `${averageConfidence}%` }}></div>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-teal-400/80">New Interview Configurator</p>
                <h2 className="mt-2 text-2xl font-black text-white">Build your next session</h2>
              </div>
              <p className="text-sm text-slate-400">Step through the prep settings and launch a focused mock interview.</p>
            </div>

            <form onSubmit={onSubmit} className="mt-8 space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
                <div className="flex items-center justify-between text-sm uppercase tracking-[0.32em] text-slate-400">
                  <span>Step 1: Role Selection</span>
                  <span className="text-teal-300">{formData.role}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
                  {ROLES.map((role) => (
                    <label key={role} className={`cursor-pointer rounded-3xl border p-4 transition ${formData.role === role ? 'border-teal-400 bg-teal-500/15 text-teal-200' : 'border-white/10 bg-white/5 text-slate-200 hover:border-teal-400/40 hover:bg-slate-800/70'}`}>
                      <input
                        type="radio"
                        name="role"
                        value={role}
                        checked={formData.role === role}
                        onChange={onChange}
                        className="sr-only"
                      />
                      <p className="text-base font-semibold">{role}</p>
                      <p className="mt-2 text-sm text-slate-400">{ROLE_DESCRIPTIONS[role]}</p>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
                  <div className="flex items-center justify-between text-sm uppercase tracking-[0.32em] text-slate-400">
                    <span>Step 2: Difficulty</span>
                    <span className="text-slate-400">Level</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {LEVELS.map((level) => (
                      <label key={level} className={`cursor-pointer rounded-3xl border p-4 text-center transition ${formData.level === level ? 'border-teal-400 bg-teal-500/15 text-teal-200' : 'border-white/10 bg-white/5 text-slate-200 hover:border-teal-400/40 hover:bg-slate-800/70'}`}>
                        <input
                          type="radio"
                          name="level"
                          value={level}
                          checked={formData.level === level}
                          onChange={onChange}
                          className="sr-only"
                        />
                        <p className="font-semibold">{level}</p>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
                  <div className="flex items-center justify-between text-sm uppercase tracking-[0.32em] text-slate-400">
                    <span>Step 2: Format</span>
                    <span className="text-slate-400">Length</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {COUNTS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, count }))}
                        className={`rounded-3xl border p-4 text-center transition ${formData.count === count ? 'border-teal-400 bg-teal-500/15 text-teal-200' : 'border-white/10 bg-white/5 text-slate-200 hover:border-teal-400/40 hover:bg-slate-800/70'}`}
                      >
                        <p className="font-semibold">{count} Qs</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-5">
                <div className="flex items-center justify-between text-sm uppercase tracking-[0.32em] text-slate-400">
                  <span>Step 3: Question Focus</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {TYPES.map((type) => (
                    formData.role === "HR/Behavioral" && type.value === "coding-mix" ? null : (
                      <label key={type.value} className={`cursor-pointer rounded-3xl border p-4 transition ${formData.interviewType === type.value ? 'border-teal-400 bg-teal-500/15 text-teal-200' : 'border-white/10 bg-white/5 text-slate-200 hover:border-teal-400/40 hover:bg-slate-800/70'}`}>
                        <input
                          type="radio"
                          name="interviewType"
                          value={type.value}
                          checked={formData.interviewType === type.value}
                          onChange={onChange}
                          className="sr-only"
                        />
                        <p className="font-semibold">{type.label}</p>
                      </label>
                    )
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-400">Ready to start your session? Make sure every option looks right.</p>
                </div>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`inline-flex items-center justify-center gap-3 rounded-3xl px-6 py-4 text-sm font-bold transition ${isProcessing ? 'cursor-not-allowed bg-slate-700 text-slate-300' : 'bg-teal-500 text-slate-950 hover:bg-teal-400'}`}
                >
                  {isProcessing ? (
                    <>
                      <span className="animate-spin h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent"></span>
                      Generating...
                    </>
                  ) : (
                    <>
                      Start Your Session
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          <section id="dashboard-history-section" className="rounded-[32px] border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-teal-400/80">Preparation History & Insights</p>
                <h2 className="mt-2 text-2xl font-black text-white">Your previous sessions</h2>
              </div>
              <p className="max-w-xl text-sm text-slate-400">Your previous sessions are displayed here for review.</p>
            </div>

            <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/50">
              <div className="overflow-x-auto">
                {isLoading && sessions.length === 0 ? (
                  <div className="flex items-center justify-center p-10">
                    <div className="animate-spin h-12 w-12 rounded-full border-2 border-teal-400 border-t-transparent" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">No sessions yet.</div>
                ) : (
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-200">
                    <thead className="bg-slate-900/90 text-slate-400">
                      <tr>
                        <th className="px-6 py-4">ID</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Level</th>
                        <th className="px-6 py-4">Score</th>
                        <th className="px-6 py-4">Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((session) => (
                        <tr key={session._id} className="border-t border-white/10 hover:bg-slate-900/80 transition-colors">
                          <td className="px-6 py-4 text-slate-300">#{session._id.slice(0, 6)}</td>
                          <td className="px-6 py-4 text-slate-400">{session.createdAt ? new Date(session.createdAt).toLocaleDateString() : '-'}</td>
                          <td className="px-6 py-4">{session.role || 'Data Scientist'}</td>
                          <td className="px-6 py-4">{session.level}</td>
                          <td className="px-6 py-4">{session.overallScore ?? session.score ?? '—'}</td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => viewSession(session)}
                              className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-500/10 px-3 py-2 text-teal-200 hover:bg-teal-500/15"
                            >
                              Detailed feedback
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
export default Dashboard
