import { useState, useEffect } from "react"
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { createSession, getSessions,reset,deleteSession } from '../features/sessions/sessionSlice'
import { toast } from 'react-toastify'
import SessionCard from "../components/SessionCard"

// Only Data Scientist role is supported now
const ROLES = [
  "Data Scientist"
];
const LEVELS = ["Junior", "Mid-Level", "Senior"];
const TYPES = [{ label: 'Oral only', value: 'oral-only' }, { label: 'Coding Mix', value: 'coding-mix' }];
const COUNTS = [5, 10, 15];

const Dashboard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { sessions, isLoading, isGenerating, isError, message } = useSelector((state) => state.sessions);
  const isProcessing = isGenerating;

  const [formData, setFormData] = useState({
    // if stored role is not in allowed list, fallback to the single available one
    role: ROLES.includes(user.preferredRole) ? user.preferredRole : ROLES[0],
    level: LEVELS[0],
    interviewType: TYPES[1].value,
    count: COUNTS[0],
  });

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

  const onChange = (e) => {
    setFormData((prevState) => ({ ...prevState, [e.target.name]: e.target.value }));
  }

  const onSubmit = (e) => {
    e.preventDefault();
    dispatch(createSession(formData));
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
          <div className="flex items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div className="rounded-3xl bg-slate-800/80 border border-white/10 p-3">
              <span className="text-xl">🤖</span>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">AI Interviewer</p>
              <p className="mt-2 text-xs text-slate-400">Prep hub</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <p className="text-sm text-slate-400">Dashboard menu</p>
            <nav className="space-y-3">
              <button className="w-full flex items-center gap-3 rounded-3xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-left text-teal-200 shadow-inner shadow-teal-500/5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-300">D</span>
                <span className="font-semibold">Dashboard</span>
              </button>
              <button className="w-full flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-left text-slate-300 hover:border-teal-400/30 hover:bg-slate-800/70">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-300">P</span>
                <span className="font-semibold">Profile</span>
              </button>
              <button className="w-full flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-left text-slate-300 hover:border-teal-400/30 hover:bg-slate-800/70">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-300">H</span>
                <span className="font-semibold">History</span>
              </button>
              <button className="w-full flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-left text-slate-300 hover:border-teal-400/30 hover:bg-slate-800/70">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-300">?</span>
                <span className="font-semibold">Help</span>
              </button>
            </nav>
          </div>
        </aside>

        <main className="space-y-6">
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
                  <span className="text-teal-300">Data Scientist</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-1">
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
                      <p className="mt-2 text-sm text-slate-400">Detailed data science interview with monitoring and case study support.</p>
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
                      <label key={count} className={`cursor-pointer rounded-3xl border p-4 text-center transition ${formData.count === count ? 'border-teal-400 bg-teal-500/15 text-teal-200' : 'border-white/10 bg-white/5 text-slate-200 hover:border-teal-400/40 hover:bg-slate-800/70'}`}>
                        <input
                          type="radio"
                          name="count"
                          value={count}
                          checked={formData.count === count}
                          onChange={onChange}
                          className="sr-only"
                        />
                        <p className="font-semibold">{count} Qs</p>
                      </label>
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

          <section className="rounded-[32px] border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
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
