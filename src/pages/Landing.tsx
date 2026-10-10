import { useState } from 'react';
import {
  ArrowRight, BookOpen, Upload, Users, Shield, Search, Star,
  CheckCircle, Download, GraduationCap, Zap, Network, Globe,
  ChevronRight, Menu, X,
} from 'lucide-react';
import Logo from '../components/Logo';
import type { View } from '../types';

interface LandingProps {
  onNavigate: (view: View) => void;
}

const features = [
  {
    icon: BookOpen,
    title: 'Vast Resource Library',
    desc: 'Access thousands of notes, question papers, lab manuals, and presentations uploaded by students and teachers.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Upload,
    title: 'Easy Uploads',
    desc: 'Drag-and-drop upload for PDFs, docs, and presentations. Tag resources by subject, semester, and type.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: GraduationCap,
    title: 'Classroom Spaces',
    desc: 'Teachers create private classrooms with unique codes. Students join and share resources in a structured environment.',
    color: 'bg-green-50 text-green-600',
  },
  {
    icon: Shield,
    title: 'Verified Content',
    desc: 'Teacher-uploaded resources get a verified badge. Admin moderation ensures quality and authenticity.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: Search,
    title: 'Smart Search & Filters',
    desc: 'Filter by semester, department, subject, and resource type. Find exactly what you need in seconds.',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    icon: Network,
    title: 'Resource Requests',
    desc: 'Can\'t find a resource? Submit a request and let the community fill the gap.',
    color: 'bg-pink-50 text-pink-600',
  },
];

const steps = [
  {
    step: '01',
    title: 'Create Your Account',
    desc: 'Sign up as a student or teacher. Select your department and semester.',
  },
  {
    step: '02',
    title: 'Browse or Upload',
    desc: 'Search existing resources or contribute your own notes, papers, and materials.',
  },
  {
    step: '03',
    title: 'Join Classrooms',
    desc: 'Enter your classroom code to connect with your class and access teacher-curated content.',
  },
  {
    step: '04',
    title: 'Learn & Grow',
    desc: 'Download, bookmark, and share resources. Rate quality content and help peers excel.',
  },
];

const stats = [
  { label: 'Resources Shared', value: '12,400+' },
  { label: 'Active Students', value: '8,300+' },
  { label: 'Colleges Onboarded', value: '40+' },
  { label: 'Downloads/Month', value: '50K+' },
];

export default function Landing({ onNavigate }: LandingProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-jakarta">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <Logo size="sm" variant="dark" />
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors">How It Works</a>
            <a href="#about" className="hover:text-blue-600 transition-colors">About</a>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button className="btn-ghost text-sm py-2 px-4" onClick={() => onNavigate('login')}>
              Log In
            </button>
            <button className="btn-primary text-sm py-2 px-4" onClick={() => onNavigate('register')}>
              Get Started <ArrowRight size={14} />
            </button>
          </div>
          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 px-5 py-4 flex flex-col gap-3">
            <a href="#features" className="text-sm font-medium text-slate-600">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600">How It Works</a>
            <a href="#about" className="text-sm font-medium text-slate-600">About</a>
            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1 text-sm py-2" onClick={() => onNavigate('login')}>Log In</button>
              <button className="btn-primary flex-1 text-sm py-2 justify-center" onClick={() => onNavigate('register')}>Get Started</button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          {/* Subtle network visualization */}
          <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
            <circle cx="200" cy="150" r="60" fill="none" stroke="#60A5FA" strokeWidth="1" />
            <circle cx="600" cy="100" r="80" fill="none" stroke="#60A5FA" strokeWidth="1" />
            <circle cx="1000" cy="200" r="50" fill="none" stroke="#60A5FA" strokeWidth="1" />
            <circle cx="400" cy="400" r="70" fill="none" stroke="#60A5FA" strokeWidth="1" />
            <circle cx="800" cy="350" r="60" fill="none" stroke="#60A5FA" strokeWidth="1" />
            <line x1="200" y1="150" x2="600" y2="100" stroke="#60A5FA" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="600" y1="100" x2="1000" y2="200" stroke="#60A5FA" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="200" y1="150" x2="400" y2="400" stroke="#60A5FA" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="600" y1="100" x2="800" y2="350" stroke="#60A5FA" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="1000" y1="200" x2="800" y2="350" stroke="#60A5FA" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="400" y1="400" x2="800" y2="350" stroke="#60A5FA" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx="200" cy="150" r="6" fill="#60A5FA" />
            <circle cx="600" cy="100" r="8" fill="#60A5FA" />
            <circle cx="1000" cy="200" r="5" fill="#60A5FA" />
            <circle cx="400" cy="400" r="7" fill="#60A5FA" />
            <circle cx="800" cy="350" r="6" fill="#60A5FA" />
          </svg>
          <div className="absolute inset-0 blue-glow" />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <Zap size={12} className="text-blue-300" />
            <span className="text-blue-200 text-xs font-semibold">Academic Resource Platform for Colleges</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-5 leading-tight tracking-tight">
            All Your Academic Resources.<br />
            <span className="text-blue-300">In One Place.</span>
          </h1>
          <p className="text-blue-100 text-base md:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            CampusFlow connects students and teachers on a unified platform to share notes, question papers,
            lab manuals, and more — organized by semester, subject, and department.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              className="btn-primary text-base py-3 px-7 rounded-xl justify-center"
              onClick={() => onNavigate('browse')}
            >
              <Search size={16} />
              Explore Resources
            </button>
            <button
              className="bg-white/10 border border-white/30 text-white font-semibold text-base py-3 px-7 rounded-xl hover:bg-white/20 transition-all flex items-center gap-2 justify-center"
              onClick={() => onNavigate('register')}
            >
              Get Started Free
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Hero stats */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="bg-white/8 border border-white/15 rounded-2xl p-4">
                <div className="text-2xl font-extrabold text-white">{s.value}</div>
                <div className="text-blue-300 text-xs font-medium mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data flow visual */}
      <section className="bg-[#F0F7FF] py-10 border-y border-blue-100">
        <div className="max-w-4xl mx-auto px-5">
          <div className="flex items-center justify-center gap-3 md:gap-6 flex-wrap text-center">
            {['Student / Teacher', 'Upload Resource', 'CampusFlow Server', 'Verified & Indexed', 'Download / View'].map((label, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-[11px] font-bold ${
                    i === 2 ? 'bg-gradient-to-br from-blue-600 to-blue-800 ring-2 ring-blue-300 ring-offset-2' : 'bg-[#1E40AF]'
                  }`}>
                    {i === 0 ? <Users size={16} /> : i === 1 ? <Upload size={16} /> : i === 2 ? <Globe size={16} /> : i === 3 ? <Shield size={16} /> : <Download size={16} />}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 max-w-[80px] leading-tight">{label}</span>
                </div>
                {i < 4 && <ArrowRight size={14} className="text-blue-300 flex-shrink-0 hidden sm:block" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-12">
            <span className="text-blue-600 text-sm font-bold tracking-wider uppercase">Features</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">
              Everything a Campus Needs
            </h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">
              Purpose-built features for the academic lifecycle — from first upload to exam prep.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="card p-6 card-hover">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="font-bold text-[#0F172A] mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 md:py-20 bg-[#F0F7FF]">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-12">
            <span className="text-blue-600 text-sm font-bold tracking-wider uppercase">How It Works</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">
              Up and running in minutes
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map((s, i) => (
              <div key={s.step} className="relative">
                <div className="card p-6 h-full">
                  <div className="text-4xl font-extrabold text-blue-100 mb-3">{s.step}</div>
                  <h3 className="font-bold text-[#0F172A] mb-2 text-sm">{s.title}</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">{s.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden lg:flex absolute top-8 -right-3 z-10 w-6 h-6 bg-blue-500 rounded-full items-center justify-center">
                    <ChevronRight size={12} className="text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-blue-600 text-sm font-bold tracking-wider uppercase">Why CampusFlow</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#0F172A] mt-2 mb-5 tracking-tight">
                Built for students,<br />trusted by teachers.
              </h2>
              <div className="space-y-4">
                {[
                  'Free access to thousands of academic resources',
                  'Organized by semester, subject, and department',
                  'Teacher-verified content with quality badges',
                  'Private classroom spaces for structured sharing',
                  'Request missing resources from the community',
                  'Available on any device — desktop, tablet, mobile',
                ].map((point) => (
                  <div key={point} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle size={12} className="text-green-600" />
                    </div>
                    <span className="text-slate-600 text-sm">{point}</span>
                  </div>
                ))}
              </div>
              <button
                className="btn-primary mt-8 py-3 px-7 text-base rounded-xl"
                onClick={() => onNavigate('register')}
              >
                Join CampusFlow <ArrowRight size={16} />
              </button>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-[#0B1E40] to-[#1E40AF] rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="avatar w-10 h-10 text-sm">RS</div>
                  <div>
                    <div className="font-bold text-sm">Prof. R. Sharma</div>
                    <div className="text-blue-300 text-xs">Information Technology · Teacher</div>
                  </div>
                  <BadgeCheckMini />
                </div>
                <div className="bg-white/10 rounded-xl p-4 mb-3">
                  <div className="text-xs text-blue-300 mb-1">Uploaded Resource</div>
                  <div className="font-semibold text-sm">Data Communication — Complete Notes</div>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[10px] bg-blue-500/30 px-2 py-0.5 rounded-full">Notes · 4.2 MB</span>
                    <span className="text-[10px] bg-green-500/30 px-2 py-0.5 rounded-full">Verified</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-blue-300">
                  <div className="flex gap-3">
                    <span>👁 1,240 views</span>
                    <span>⬇ 389 downloads</span>
                  </div>
                  <div className="flex">
                    {[1,2,3,4,5].map(i => <Star key={i} size={10} className="fill-amber-400 text-amber-400" />)}
                    <span className="ml-1 text-white">4.8</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 text-xs text-blue-300">
                  <span>🔔 12 students downloaded in the last hour</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="hero-gradient py-16">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
            Your campus resources, organized.
          </h2>
          <p className="text-blue-200 mb-8">
            Join thousands of students and teachers already using CampusFlow.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              className="bg-white text-blue-700 font-bold py-3 px-8 rounded-xl hover:bg-blue-50 transition-colors flex items-center gap-2 justify-center"
              onClick={() => onNavigate('register')}
            >
              Create Free Account <ArrowRight size={16} />
            </button>
            <button
              className="bg-white/10 border border-white/30 text-white font-semibold py-3 px-8 rounded-xl hover:bg-white/20 transition-all flex items-center gap-2 justify-center"
              onClick={() => onNavigate('login')}
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="bg-[#060E23] py-10">
        <div className="max-w-6xl mx-auto px-5">
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
            <div>
              <Logo size="sm" variant="light" showTagline />
              <p className="text-slate-400 text-xs mt-3 max-w-xs leading-relaxed">
                A Data Communication subject project — demonstrating client-server resource sharing
                architectures in an academic context.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
              {['Browse Resources', 'Upload Resource', 'Join Classroom', 'Resource Requests'].map((l) => (
                <button
                  key={l}
                  className="text-slate-400 hover:text-white transition-colors text-left"
                  onClick={() => onNavigate('login')}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-2">
            <p className="text-slate-500 text-xs">© 2026 CampusFlow. Academic Resource Management System.</p>
            <p className="text-slate-600 text-xs">Data Communication Project · IT Department</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BadgeCheckMini() {
  return (
    <div className="ml-auto w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
      <CheckCircle size={12} className="text-white" />
    </div>
  );
}
