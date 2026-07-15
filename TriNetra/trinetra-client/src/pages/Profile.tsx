import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Shield, MapPin, Building2, Calendar, BadgeCheck, LogOut, Star, Fingerprint } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Profile() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  if (!profile) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-slate-500">No profile data available. Please log in.</p>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleBadgeColor = {
    'Policymaker': 'bg-purple-100 text-purple-800 border-purple-200',
    'Analyst': 'bg-blue-100 text-blue-800 border-blue-200',
    'Supervisor': 'bg-amber-100 text-amber-800 border-amber-200',
    'Investigator': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  }[profile.role] || 'bg-slate-100 text-slate-800 border-slate-200';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Officer Profile</h1>
          <p className="text-slate-500 text-sm mt-1">Your authenticated session details.</p>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-4 py-2 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>

      {/* Profile Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="h-24 bg-primary-900 relative">
          <div className="absolute -bottom-12 left-8">
            <div className="w-24 h-24 bg-white rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-primary-900">
              <User className="w-12 h-12" />
            </div>
          </div>
        </div>
        
        <div className="pt-16 pb-6 px-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-primary-900">{profile.name}</h2>
              <p className="text-slate-500 mt-1">{profile.designation_name || 'Officer'} — {profile.rank_name}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("px-3 py-1.5 rounded-lg text-sm font-bold border", roleBadgeColor)}>
                <Shield className="w-4 h-4 inline mr-1" />
                {profile.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Identification */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-accent-500" />
            Identification
          </h3>
          <div className="space-y-4">
            <InfoRow label="Employee ID" value={String(profile.employee_id)} />
            <InfoRow label="KGID" value={profile.kgid || 'N/A'} />
            <InfoRow label="Date of Birth" value={profile.dob || 'N/A'} icon={<Calendar className="w-4 h-4" />} />
            <InfoRow label="Appointment Date" value={profile.appointment_date || 'N/A'} icon={<Calendar className="w-4 h-4" />} />
          </div>
        </div>

        {/* Posting */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-accent-500" />
            Current Posting
          </h3>
          <div className="space-y-4">
            <InfoRow label="District" value={profile.district_name} icon={<MapPin className="w-4 h-4" />} />
            <InfoRow label="Unit / Station" value={profile.unit_name} icon={<Building2 className="w-4 h-4" />} />
            <InfoRow label="Rank" value={profile.rank_name} icon={<Star className="w-4 h-4" />} />
            <InfoRow label="Designation" value={profile.designation_name} icon={<BadgeCheck className="w-4 h-4" />} />
          </div>
        </div>

        {/* Access Scope */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 md:col-span-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent-500" />
            Security & Access Scope
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="text-sm font-bold text-primary-900 mb-1">RBAC Role</div>
              <div className="text-sm text-slate-600">{profile.role}</div>
              <div className="text-xs text-slate-400 mt-2">
                {profile.role === 'Investigator' && 'Access: Own station cases only'}
                {profile.role === 'Supervisor' && 'Access: All cases in your district'}
                {profile.role === 'Analyst' && 'Access: State-wide aggregated data'}
                {profile.role === 'Policymaker' && 'Access: State-wide full access'}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="text-sm font-bold text-primary-900 mb-1">SQL Filter Applied</div>
              <div className="text-xs text-slate-600 font-mono bg-white p-2 rounded border border-slate-200 mt-1">
                {profile.role === 'Investigator' && `cm.PoliceStationID = ${profile.unit_id}`}
                {profile.role === 'Supervisor' && `u.DistrictID = ${profile.district_id}`}
                {(profile.role === 'Analyst' || profile.role === 'Policymaker') && '1=1 (unrestricted)'}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="text-sm font-bold text-primary-900 mb-1">Audit Log Access</div>
              <div className="text-sm text-slate-600">
                {profile.role === 'Investigator' ? (
                  <span className="text-red-600 font-medium">Denied</span>
                ) : (
                  <span className="text-emerald-600 font-medium">Granted</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon && <span className="text-slate-400">{icon}</span>}
        {label}
      </div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
