import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldAlert, Lock, User, KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { loginApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const id = parseInt(employeeId);
    if (isNaN(id) || id <= 0) {
      setError('Please enter a valid numeric Employee ID.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await loginApi(id, password);
      login(result.token, result.profile);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 selection:bg-accent-200 selection:text-primary-900 relative">
      
      {/* Navigation Bar */}
      <nav className="absolute top-0 left-0 w-full bg-white/85 backdrop-blur-lg border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-md overflow-hidden bg-white shadow-sm flex items-center justify-center p-0.5 border border-slate-100">
              <img src="/logo.png" alt="TriNetra Logo" className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-lg tracking-tight text-primary-900">
              TRINETRA
            </span>
          </Link>
        </div>
      </nav>

      <div className="w-full max-w-md mt-12">

        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-white rounded-full border-4 border-primary-900 flex items-center justify-center text-primary-900 mb-4 shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-primary-900 tracking-tight">TriNetra Portal</h1>
          <p className="text-slate-500 mt-2">Secure Law Enforcement Access</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <form onSubmit={handleLogin} className="space-y-6">

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Employee ID */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Employee ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all"
                  placeholder="e.g. 101"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-primary-900 hover:bg-primary-800 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Authenticate
                </>
              )}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 text-center">Quick Demo Login</div>
            <div className="flex gap-2 justify-center">
              {[96, 275, 104].map(id => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setEmployeeId(id.toString());
                    setPassword('1234');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-primary-900 bg-primary-50 rounded border border-primary-100 hover:bg-primary-100 transition-colors"
                >
                  ID: {id}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 mt-4">
              Password is auto-filled to <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">1234</code>
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>Unauthorized access is strictly prohibited.</p>
          <p className="mt-1">All activity is logged and monitored.</p>
        </div>
      </div>
    </div>
  );
}
