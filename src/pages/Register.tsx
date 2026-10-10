import { useState } from 'react';
import { Eye, EyeOff, ArrowLeft, ChevronRight, GraduationCap, BookOpen } from 'lucide-react';
import Logo from '../components/Logo';
import type { View } from '../types';
import { departments } from '../data/mockData';
import { useCampusFlow } from '../context/CampusFlowContext';

interface RegisterProps {
  onNavigate: (view: View) => void;
  onLogin: () => void;
}

export default function Register({ onNavigate, onLogin }: RegisterProps) {
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState(departments[0] || 'Information Technology');
  const [semester, setSemester] = useState('5');
  const [designation, setDesignation] = useState('Assistant Professor');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { registerUser } = useCampusFlow();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (step === 1) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      setStep(2);
      return;
    }
    if (!agreedToTerms) { setError('Please accept the Terms of Service and Privacy Policy to continue.'); return; }
    const result = await registerUser({ name, email, password, role, department, semester: role === 'student' ? Number(semester) : undefined, designation: role === 'teacher' ? designation : undefined });
    if (!result.success) { setError(result.message ?? 'Unable to create your account.'); return; }
    if (result.authenticated) onLogin();
    else setSuccessMessage(result.message ?? 'Check your email to confirm your account, then sign in.');
  };

  return (
    <div className="min-h-screen flex bg-[#EEF4FF]">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[40%] hero-gradient relative overflow-hidden p-10">
        <button
          className="text-blue-300 hover:text-white flex items-center gap-1.5 text-sm font-medium transition-colors mb-10"
          onClick={() => onNavigate('landing')}
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>
        <div className="flex-1 flex flex-col justify-center">
          <Logo size="lg" variant="light" showTagline />
          <div className="mt-10 space-y-4">
            <p className="text-blue-200 text-sm leading-relaxed">
              Join thousands of students and teachers sharing academic resources on CampusFlow.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              {[
                { label: 'Students', value: '8,300+' },
                { label: 'Teachers', value: '240+' },
                { label: 'Resources', value: '12,400+' },
                { label: 'Colleges', value: '40+' },
              ].map((s) => (
                <div key={s.label} className="bg-white/8 border border-white/15 rounded-xl p-4 text-center">
                  <div className="text-xl font-extrabold text-white">{s.value}</div>
                  <div className="text-blue-300 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-5 overflow-y-auto">
        <div className="w-full max-w-[440px] py-6">
          <div className="lg:hidden mb-6 flex items-center justify-between">
            <Logo size="sm" variant="dark" />
            <button
              className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm"
              onClick={() => onNavigate('landing')}
            >
              <ArrowLeft size={14} />
              Home
            </button>
          </div>

          <div className="card p-8">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {[1, 2].map((s) => (
                <div key={s} className={`flex items-center gap-1.5 ${s > 1 ? 'ml-2' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step >= s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {s}
                  </div>
                  <span className={`text-xs font-medium ${step >= s ? 'text-blue-600' : 'text-slate-400'}`}>
                    {s === 1 ? 'Account Info' : 'Academic Details'}
                  </span>
                  {s < 2 && <div className={`flex-1 h-0.5 w-8 ${step > s ? 'bg-blue-400' : 'bg-slate-100'}`} />}
                </div>
              ))}
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
                {step === 1 ? 'Create your account' : 'Academic details'}
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {step === 1 ? 'Start with your basic information.' : 'Tell us about your academic role.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {step === 1 && (
                <>
                  <div>
                    <label className="label">Full Name</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Aryan Mehta"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="you@campus.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Password</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        className="input-field pr-10"
                        placeholder="Create a strong password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        onClick={() => setShowPass(!showPass)}
                      >
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">Confirm Password</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <label className="label">I am a...</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          role === 'student' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => setRole('student')}
                      >
                        <GraduationCap size={24} className={role === 'student' ? 'text-blue-600' : 'text-slate-400'} />
                        <span className={`text-sm font-bold ${role === 'student' ? 'text-blue-700' : 'text-slate-600'}`}>
                          Student
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          role === 'teacher' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => setRole('teacher')}
                      >
                        <BookOpen size={24} className={role === 'teacher' ? 'text-blue-600' : 'text-slate-400'} />
                        <span className={`text-sm font-bold ${role === 'teacher' ? 'text-blue-700' : 'text-slate-600'}`}>
                          Teacher
                        </span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">Department</label>
                    <select
                      className="input-field"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    >
                      {departments.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  {role === 'student' ? (
                    <div>
                      <label className="label">Current Semester</label>
                      <select
                        className="input-field"
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                          <option key={s} value={String(s)}>Semester {s}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="label">Teaching Designation</label>
                      <select
                        className="input-field"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                      >
                        <option value="Assistant Professor">Assistant Professor</option>
                        <option value="Associate Professor">Associate Professor</option>
                        <option value="Professor">Professor</option>
                        <option value="HOD">HOD</option>
                        <option value="Lecturer">Lecturer</option>
                      </select>
                    </div>
                  )}
                  <div className="flex items-start gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="terms"
                      className="mt-0.5 w-4 h-4 accent-blue-600"
                      checked={agreedToTerms}
                      required
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                    />
                    <label htmlFor="terms" className="text-xs text-slate-500 cursor-pointer leading-relaxed">
                      I agree to CampusFlow's{' '}
                      <span className="text-blue-600 font-medium">Terms of Service</span> and{' '}
                      <span className="text-blue-600 font-medium">Privacy Policy</span>
                    </label>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                {step === 2 && (
                  <button
                    type="button"
                    className="btn-secondary flex-1 justify-center py-3"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                )}
                <button type="submit" className="btn-primary flex-1 justify-center py-3 text-base rounded-xl">
                  {step === 1 ? 'Continue' : 'Create Account'}
                  <ChevronRight size={16} />
                </button>
              </div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              {successMessage && <p role="status" className="text-sm text-green-700">{successMessage}</p>}
            </form>

            <p className="text-center text-sm text-slate-500 mt-5">
              Already have an account?{' '}
              <button
                className="text-blue-600 font-semibold hover:text-blue-700"
                onClick={() => onNavigate('login')}
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
