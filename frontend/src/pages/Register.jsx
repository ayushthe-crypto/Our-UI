import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { register, reset } from '../features/auth/authSlice'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-toastify'

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    password2: '',
  })

  const { name, email, password, password2 } = formData

  const navigate = useNavigate()
  const dispatch = useDispatch()

  const { user, isLoading, isError, isSuccess, message } = useSelector((state) => state.auth)

  useEffect(() => {
    if (isError) {
      toast.error(message)
      dispatch(reset())
    }

    if (isSuccess) {
      toast.success('User Registered Successfully')
      navigate('/')
      dispatch(reset())
    }

    if (user && !isSuccess) {
      navigate('/')
    }
  }, [user, isError, isSuccess, message, navigate, dispatch])

  const onChange = (e) => {
    setFormData((prevState) => ({
      ...prevState,
      [e.target.name]: e.target.value,
    }))
  }

  const onSubmit = (e) => {
    e.preventDefault()
    if (password !== password2) {
      toast.error('Passwords do not match')
    } else {
      const userData = {
        name,
        email,
        password,
      }
      dispatch(register(userData))
    }
  }

  if (isLoading) {
    return (
      <div className='flex justify-center items-center h-screen bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white'></div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-[var(--background-gradient)] py-10'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 items-center'>
          <div className='relative overflow-hidden rounded-3xl bg-white shadow-2xl'>
            <div className='absolute -left-16 -top-16 h-48 w-48 rounded-full bg-teal-300 opacity-30 blur-3xl'></div>
            <div className='absolute -bottom-20 -right-16 h-72 w-72 rounded-full bg-pink-300 opacity-30 blur-3xl'></div>

            <div className='relative z-10 p-8 sm:p-12'>
              <div className='mb-8'>
                <p className='text-xs font-black uppercase tracking-widest text-teal-500'>Prepare better. Perform smarter</p>
                <h1 className='mt-4 text-3xl sm:text-4xl font-extrabold text-slate-900'>Create Your Account</h1>
                <p className='mt-3 text-slate-600 text-sm sm:text-base'>Build confidence, sharpen your skills, and walk into every interview fully prepared.</p>
              </div>

              <form onSubmit={onSubmit} className='grid grid-cols-1 gap-4'>
                <div className='space-y-1'>
                  <label htmlFor='name' className='text-[10px] font-bold uppercase tracking-wider text-slate-500'>Full Name</label>
                  <input
                    id='name'
                    type='text'
                    name='name'
                    value={name}
                    onChange={onChange}
                    required
                    className='w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 transition'
                    placeholder='Kushagra Sharma'
                  />
                </div>

                <div className='space-y-1'>
                  <label htmlFor='email' className='text-[10px] font-bold uppercase tracking-wider text-slate-500'>Email</label>
                  <input
                    id='email'
                    type='email'
                    name='email'
                    value={email}
                    onChange={onChange}
                    required
                    className='w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 transition'
                    placeholder='kushagra@gmail.com'
                  />
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div className='space-y-1'>
                    <label htmlFor='password' className='text-[10px] font-bold uppercase tracking-wider text-slate-500'>Password</label>
                    <input
                      id='password'
                      type='password'
                      name='password'
                      value={password}
                      onChange={onChange}
                      required
                      className='w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 transition'
                      placeholder='Enter your password'
                    />
                  </div>
                  <div className='space-y-1'>
                    <label htmlFor='password2' className='text-[10px] font-bold uppercase tracking-wider text-slate-500'>Confirm Password</label>
                    <input
                      id='password2'
                      type='password'
                      name='password2'
                      value={password2}
                      onChange={onChange}
                      required
                      className='w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 transition'
                      placeholder='Confirm your password'
                    />
                  </div>
                </div>

                <button type='submit' className='w-full rounded-xl bg-[linear-gradient(135deg,#10b981_0%,#059669_100%)] px-6 py-3 text-base font-bold text-white shadow-lg shadow-emerald-300 transition hover:bg-[linear-gradient(135deg,#34d399_0%,#10b981_100%)] active:scale-[0.98]'>Create My Account</button>
              </form>

              <p className='mt-6 text-center text-sm text-slate-500'>
                Already have an account? <Link to='/login' className='font-semibold text-teal-500 hover:text-teal-600'>Sign In</Link>
              </p>
            </div>
          </div>

          <div className='relative hidden h-[480px] rounded-3xl shadow-2xl lg:block'>
            <img
              src='https://image2url.com/r2/default/images/1775318489764-11396304-57d5-47c8-a415-9956f1b2ac93.jpeg'
              alt='AI Assessment'
              className='h-full w-full object-cover rounded-3xl'
            />
            <div className='absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-black/40 rounded-3xl' />
            <div className='absolute bottom-8 left-8 right-8 text-white'>
              <p className='text-sm font-medium uppercase tracking-wider text-teal-200'>Transform the way you learn</p>
              <h2 className='mt-2 text-2xl font-bold'>Interactive coding interviews, AI insights, real-time feedback</h2>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
