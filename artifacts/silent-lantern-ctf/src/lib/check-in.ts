export interface LearnerProfile {
  name: string;
  email: string;
  instructorEmail: string;
}
export interface CheckInDraft extends LearnerProfile {
  team: string;
  sessionId: string;
}

const PROFILE_KEY = 'silent-lantern-learner-profile';
const DRAFT_KEY = 'silent-lantern-check-in';
const isProfile = (v: unknown): v is LearnerProfile => {
  if (!v || typeof v !== 'object') return false;
  const p = v as LearnerProfile;
  return typeof p.name === 'string' && typeof p.email === 'string' && typeof p.instructorEmail === 'string';
};

function read(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch { return null; }
}
export function loadLearnerProfile(): LearnerProfile | null {
  const p = read(PROFILE_KEY);
  return isProfile(p) && p.name.trim() && p.email.trim() && p.instructorEmail.trim() ? p : null;
}
export function rememberLearner(p: LearnerProfile) {
  if (p.name.trim() && p.email.trim() && p.instructorEmail.trim()) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      name: p.name, email: p.email, instructorEmail: p.instructorEmail,
    }));
  }
}
export function loadCheckInDraft(): CheckInDraft {
  const d = read(DRAFT_KEY) as Partial<CheckInDraft> | null;
  if (d && typeof d.team === 'string' && typeof d.sessionId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.sessionId) && isProfile(d)) {
    return d as CheckInDraft;
  }
  return { name: '', email: '', instructorEmail: '', ...loadLearnerProfile(), team: '', sessionId: crypto.randomUUID() };
}
export function storeCheckInDraft(d: CheckInDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
}
export function clearCheckInDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
