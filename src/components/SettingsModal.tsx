import { useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  User as UserIcon,
  LogOut,
  Loader2,
  Check,
  AtSign,
} from 'lucide-react';
import type { Profile } from '@/types';
import { fetchProfile, updateProfile, uploadAvatar, checkUsernameAvailable } from '@/chatApi';

interface SettingsModalProps {
  onClose: () => void;
  onSignOut: () => void;
}

export default function SettingsModal({ onClose, onSignOut }: SettingsModalProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchProfile();
        if (cancelled) return;
        if (p) {
          setProfile(p);
          setName(p.name);
          setUsername(p.username ?? '');
          setBio(p.bio ?? '');
          setAvatarUrl(p.avatarUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setSaving(true);
      const url = await uploadAvatar(file);
      setAvatarUrl(url);
      await updateProfile({ avatarUrl: url });
      setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update photo');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUsername && cleanUsername.length < 3) {
        setError('Username must be at least 3 characters.');
        setSaving(false);
        return;
      }
      if (cleanUsername && cleanUsername !== (profile?.username ?? '')) {
        const available = await checkUsernameAvailable(cleanUsername);
        if (!available) {
          setError('That username is already taken.');
          setSaving(false);
          return;
        }
      }
      await updateProfile({
        name: name.trim() || undefined,
        bio: bio.trim() || null,
        username: cleanUsername || null,
      });
      setProfile((p) => (p ? { ...p, name: name.trim(), bio: bio.trim(), username: cleanUsername || null } : p));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center">
              <div className="relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover ring-2 ring-slate-100"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center">
                    <UserIcon className="w-10 h-10 text-slate-300" />
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={saving}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md hover:bg-blue-600 disabled:opacity-50 transition"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">Tap the camera to change your photo</p>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="choose a handle"
                  className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">Letters, numbers, and underscores. Leave empty to remove.</p>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell something about yourself"
                rows={3}
                maxLength={200}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition resize-none"
              />
              <p className="text-xs text-slate-400 mt-1 text-right">{bio.length}/200</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" /> Saved
                </>
              ) : (
                'Save changes'
              )}
            </button>

            <div className="pt-2 border-t border-slate-200">
              <button
                onClick={onSignOut}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 transition"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
