import React, { useState } from 'react';
import {
  X,
  User,
  Mail,
  Shield,
  HardDrive,
  FolderKanban,
  LogOut,
  LogIn,
  CheckCircle2,
  Sparkles,
  CloudOff,
  Cloud,
  Settings,
  HelpCircle,
  ExternalLink,
  Laptop
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenAbout?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenAbout
}) => {
  const { user, isGuest, signInWithGoogle, continueAsGuest, signOut, updateProfile } = useAuth();
  const { projects } = useProject();
  const isOnline = useOnlineStatus();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user?.name || '');
  const [googleEmailInput, setGoogleEmailInput] = useState(user?.email || 'emailofsalim@gmail.com');
  const [showSignInForm, setShowSignInForm] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await signInWithGoogle(googleEmailInput, editedName || 'Salim Geomatics');
    setShowSignInForm(false);
  };

  const handleSaveName = () => {
    if (editedName.trim()) {
      updateProfile({ name: editedName.trim() });
      setIsEditingName(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#c9a063]/20 border border-[#c9a063]/40 flex items-center justify-center text-[#c9a063]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">User Profile & Account</h2>
              <p className="text-[11px] text-slate-400">BhuNex Studio Geomatics Identity & Projects</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* User Profile Card */}
          <div className="p-4 rounded-xl bg-[#181818] border border-white/5 flex items-center gap-4 relative">
            <div className="relative">
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.name}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-[#c9a063]/50 shadow-md"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[#242424] border-2 border-white/10 flex items-center justify-center text-slate-300">
                  <User className="w-7 h-7" />
                </div>
              )}
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#181818] flex items-center justify-center ${
                  !isGuest ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                title={!isGuest ? 'Google Authenticated' : 'Guest Offline Mode'}
              />
            </div>

            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    value={editedName}
                    onChange={e => setEditedName(e.target.value)}
                    className="bg-[#242424] border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#c9a063]"
                    placeholder="Your Name"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="px-2 py-1 bg-[#c9a063] text-black font-semibold text-[11px] rounded-lg"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white truncate">{user?.name || 'Guest Surveyor'}</h3>
                  <button
                    onClick={() => {
                      setEditedName(user?.name || '');
                      setIsEditingName(true);
                    }}
                    className="text-[10px] text-[#c9a063] hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}

              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                {user?.email || 'guest@bhunex.local'}
              </p>

              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    !isGuest
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {!isGuest ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Google Account
                    </>
                  ) : (
                    <>
                      <Laptop className="w-3 h-3" /> Guest (Local Mode)
                    </>
                  )}
                </span>

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 text-slate-400 border border-white/5">
                  {isOnline ? (
                    <>
                      <Cloud className="w-3 h-3 text-sky-400" /> Online
                    </>
                  ) : (
                    <>
                      <CloudOff className="w-3 h-3 text-amber-400" /> Offline
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Account Status / Switching */}
          {isGuest || showSignInForm ? (
            <div className="p-4 rounded-xl bg-[#161616] border border-[#c9a063]/30 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#c9a063]/10 text-[#c9a063]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Sign in with Google</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Link your Google account to associate your projects under your identity and enable cross-device backup.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={googleEmailInput}
                    onChange={e => setGoogleEmailInput(e.target.value)}
                    placeholder="Enter your Gmail address"
                    className="flex-1 bg-[#202020] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#c9a063]"
                  />
                  <button
                    onClick={handleGoogleSignIn}
                    className="px-4 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 shrink-0"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In with Google
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  Automatic user profile creation on first sign-in. No password required.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-xs font-semibold text-emerald-300">Signed in via Google</div>
                  <div className="text-[10px] text-slate-400">All projects are bound to your account profile</div>
                </div>
              </div>
              <button
                onClick={() => setShowSignInForm(true)}
                className="text-xs text-[#c9a063] hover:underline font-medium"
              >
                Switch Account
              </button>
            </div>
          )}

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#161616] border border-white/5">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <FolderKanban className="w-3.5 h-3.5 text-[#c9a063]" />
                <span>My Projects</span>
              </div>
              <div className="text-lg font-bold text-white">{projects.length} Active</div>
            </div>

            <div className="p-3 rounded-xl bg-[#161616] border border-white/5">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                <span>Storage Engine</span>
              </div>
              <div className="text-lg font-bold text-white">IndexedDB Offline</div>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            {onOpenSettings && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-white/5 flex items-center justify-between text-xs text-slate-300 transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4 text-slate-400" /> Application Settings & Units
                </span>
                <span className="text-[10px] text-slate-500">Working Zone, Units</span>
              </button>
            )}

            {onOpenAbout && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAbout();
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-white/5 flex items-center justify-between text-xs text-slate-300 transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-slate-400" /> About BhuNex Studio Geomatics
                </span>
                <span className="text-[10px] text-slate-500">v3.7 Production</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-[#161616] flex items-center justify-between">
          {!isGuest ? (
            <button
              onClick={() => {
                continueAsGuest();
              }}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5"
            >
              <Laptop className="w-3.5 h-3.5" /> Continue as Guest
            </button>
          ) : (
            <div className="text-[11px] text-slate-500">Guest mode enabled</div>
          )}

          <div className="flex items-center gap-2">
            {!isGuest && (
              <button
                onClick={signOut}
                className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
