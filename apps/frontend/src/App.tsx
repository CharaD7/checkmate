import { FormEvent, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  LogOut,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type User = { id: string; email: string };
type Classroom = {
  id: string;
  name: string;
  updatedAt: string;
  _count: { documents: number };
};
type Submission = {
  id: string;
  studentName: string;
  originalName: string;
  fileSize: number;
  createdAt: string;
  webSearchStatus: 'PENDING' | 'COMPLETE' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED';
  webSearchResults: WebSource[];
  webSearchError: string | null;
  pageCount: number;
  archiveMatchedPageCount: number;
  webMatchedPageCount: number;
  matchedPageCount: number;
  similarityPercent: number;
};
type WebSource = {
  title: string;
  url: string;
  description: string;
  matchedPhrase: string;
  pageNumber: number;
};
type PageMatch = {
  pageNumber: number;
  sourcePageNumber: number;
  text: string;
  sourceText: string;
  matchedPhraseCount: number;
  pageSimilarityPercent: number;
  sourcePageSimilarityPercent: number;
  lineScorePercent: number;
  sourceLineScorePercent: number;
};
type Comparison = {
  id: string;
  left: { id: string; studentName: string; originalName: string; classroomName: string; pageCount: number };
  right: { id: string; studentName: string; originalName: string; classroomName: string; pageCount: number };
  similarityPercent: number;
  rightSimilarityPercent: number;
  sharedPhraseCount: number;
  pageCount: number;
  matchedPageCount: number;
  matches: PageMatch[];
};
type Report = {
  classroom: { id: string; name: string };
  submissions: Submission[];
  comparisons: Comparison[];
  method: { name: string; caveat: string };
};
type StudentResult = {
  id: string;
  studentName: string;
  originalName: string;
  createdAt: string;
  webSearchStatus: Submission['webSearchStatus'];
  webSearchError: string | null;
  webSearchResults: WebSource[];
  archiveMatches: Array<{
    pageNumber: number;
    text: string;
    matchedPhraseCount: number;
    pageSimilarityPercent: number;
    lineScorePercent: number;
    source: string;
  }>;
  pageCount: number;
  archiveMatchedPageCount: number;
  webMatchedPageCount: number;
  matchedPageCount: number;
  similarityPercent: number;
};
type StudentReceipt = {
  classroomName: string;
  submissions: StudentResult[];
  method: string;
};
type Session = { accessToken: string; user: User };

const TOKEN_KEY = 'checkmate.session';
const THEME_KEY = 'checkmate.theme';
const API = '/api';
const SESSION_EXPIRED_EVENT = 'checkmate:session-expired';
const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again.';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

async function request<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(' ')
      : payload?.message;
    throw new Error(message || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

async function requestPublic<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(' ')
      : payload?.message;
    throw new Error(message || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const stored = localStorage.getItem(TOKEN_KEY);
      return stored ? (JSON.parse(stored) as Session) : null;
    } catch {
      return null;
    }
  });
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    function handleSessionExpired() {
      localStorage.removeItem(TOKEN_KEY);
      setClasses([]);
      setSelectedClassId(null);
      setReport(null);
      setSelectedComparisonId(null);
      setSession(null);
      setError(SESSION_EXPIRED_MESSAGE);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const selectedClass =
    classes.find((classroom) => classroom.id === selectedClassId) ?? null;
  const selectedComparison =
    report?.comparisons.find(
      (comparison) => comparison.id === selectedComparisonId,
    ) ?? report?.comparisons[0] ?? null;
  const publicCode = window.location.pathname.match(/^\/submit\/([A-Za-z0-9_-]{43})$/)?.[1];
  const receiptToken = window.location.pathname.match(
    /^\/results\/([A-Za-z0-9_-]{43})$/,
  )?.[1];

  async function refreshClasses(token = session?.accessToken) {
    if (!token) return;
    const result = await request<Classroom[]>('/classes', token);
    setClasses(result);
    setSelectedClassId((current) =>
      current && result.some((classroom) => classroom.id === current)
        ? current
        : (result[0]?.id ?? null),
    );
  }

  async function refreshReport(classId: string, token = session?.accessToken) {
    if (!token) return;
    const result = await request<Report>(`/classes/${classId}/report`, token);
    setReport(result);
    setSelectedComparisonId((current) =>
      current && result.comparisons.some((comparison) => comparison.id === current)
        ? current
        : (result.comparisons[0]?.id ?? null),
    );
  }

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    void refreshClasses(session.accessToken)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session || !selectedClassId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError('');
    void refreshReport(selectedClassId, session.accessToken)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [selectedClassId, session?.accessToken]);

  useEffect(() => {
    if (
      !session ||
      !selectedClassId ||
      !report?.submissions.some((submission) => submission.webSearchStatus === 'PENDING')
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshReport(selectedClassId, session.accessToken).catch(
        (reason: Error) => setError(reason.message),
      );
    }, 3000);
    return () => window.clearInterval(interval);
  }, [report, selectedClassId, session?.accessToken]);

  if (receiptToken) {
    return (
      <StudentResultsPage
        receiptToken={receiptToken}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'light' ? 'dark' : 'light'))
        }
      />
    );
  }

  if (publicCode) {
    return (
      <StudentSubmissionPage
        code={publicCode}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'light' ? 'dark' : 'light'))
        }
      />
    );
  }

  function startSession(newSession: Session) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(newSession));
    setClasses([]);
    setReport(null);
    setSelectedClassId(null);
    setSession(newSession);
  }

  function endSession() {
    localStorage.removeItem(TOKEN_KEY);
    setClasses([]);
    setReport(null);
    setSession(null);
  }

  if (!session) {
    return (
      <AuthScreen
        onSession={startSession}
        onError={setError}
        error={error}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'light' ? 'dark' : 'light'))
        }
      />
    );
  }

  const activeSession = session;

  async function createClass(name: string) {
    setError('');
    try {
      await request<Classroom>('/classes', activeSession.accessToken, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await refreshClasses();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function deleteClass(classroom: Classroom) {
    if (
      !window.confirm(
        `Delete “${classroom.name}”, all ${classroom._count.documents} submissions, and their stored files? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError('');
    try {
      await request(`/classes/${classroom.id}`, activeSession.accessToken, {
        method: 'DELETE',
      });
      await refreshClasses();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function uploadFiles(files: File[], names: string[]) {
    if (!selectedClassId) return;
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    form.append('studentNames', JSON.stringify(names));
    setError('');
    try {
      await request(`/classes/${selectedClassId}/submissions`, activeSession.accessToken, {
        method: 'POST',
        body: form,
      });
      await Promise.all([
        refreshClasses(),
        refreshReport(selectedClassId, activeSession.accessToken),
      ]);
    } catch (reason) {
      setError((reason as Error).message);
      throw reason;
    }
  }

  async function deleteSubmission(submission: Submission) {
    if (!selectedClassId) return;
    if (!window.confirm(`Remove ${submission.studentName}’s submission?`)) return;
    setError('');
    try {
      await request(
        `/classes/${selectedClassId}/submissions/${submission.id}`,
        activeSession.accessToken,
        { method: 'DELETE' },
      );
      await Promise.all([
        refreshClasses(activeSession.accessToken),
        refreshReport(selectedClassId, activeSession.accessToken),
      ]);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function rerunWebCheck(submission: Submission) {
    if (!selectedClassId) return;
    await request(
      `/classes/${selectedClassId}/submissions/${submission.id}/web-check`,
      activeSession.accessToken,
      { method: 'POST' },
    );
    await refreshReport(selectedClassId, activeSession.accessToken);
  }

  async function createStudentLink(classroomId: string) {
    const result = await request<{ code: string }>(
      `/classes/${classroomId}/submission-link`,
      activeSession.accessToken,
      { method: 'POST' },
    );
    return `${window.location.origin}/submit/${result.code}`;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="/" aria-label="CheckMate home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">CHECKMATE</span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>
        <button
          className={`nav-link ${selectedClassId ? '' : 'is-active'}`}
          onClick={() => setSelectedClassId(null)}
        >
          <BookOpen size={17} strokeWidth={1.8} />
          <span>Class board</span>
          <span className="nav-count">{classes.length.toString().padStart(2, '0')}</span>
        </button>

        <div className="sidebar-section-head">
          <div className="sidebar-label">YOUR CLASSES</div>
          <span className="sidebar-count">{classes.length.toString().padStart(2, '0')}</span>
        </div>
        <nav className="class-nav" aria-label="Your classes">
          {classes.map((classroom, index) => (
            <button
              className={`class-nav-item ${
                selectedClassId === classroom.id ? 'is-active' : ''
              }`}
              key={classroom.id}
              onClick={() => setSelectedClassId(classroom.id)}
            >
              <span className="class-sequence">{(index + 1).toString().padStart(2, '0')}</span>
              <span className="class-nav-name">{classroom.name}</span>
              <span className="class-nav-total">
                {classroom._count.documents.toString().padStart(2, '0')}
              </span>
            </button>
          ))}
          {classes.length === 0 && (
            <p className="sidebar-empty">Your classes will appear here.</p>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={16} />
            <span>PRIVATE WORKSPACE</span>
          </div>
          <button className="account-button" onClick={endSession}>
            <span className="avatar">
              {activeSession.user.email.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-email">{activeSession.user.email}</span>
            <LogOut size={16} />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            <span>CHECKMATE</span>
            <span className="breadcrumb-divider">/</span>
            <span>{selectedClass ? selectedClass.name : 'CLASS BOARD'}</span>
          </div>
          <div className="topbar-tools">
            <ThemeToggle
              theme={theme}
              onToggle={() =>
                setTheme((current) => (current === 'light' ? 'dark' : 'light'))
              }
            />
            <div className="topbar-status">
              <span className="status-light" />
              LOCAL WORKSPACE
            </div>
          </div>
        </header>

        <div className="content-wrap">
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss message">
                <X size={16} />
              </button>
            </div>
          )}

          {!selectedClass ? (
            <ClassBoard
              classes={classes}
              loading={loading}
              onSelect={setSelectedClassId}
              onCreate={createClass}
              onDelete={deleteClass}
            />
          ) : (
            <ClassWorkspace
              classroom={selectedClass}
              report={report}
              comparison={selectedComparison}
              loading={loading}
              onBack={() => setSelectedClassId(null)}
              onUpload={uploadFiles}
              onSelectComparison={setSelectedComparisonId}
              onDeleteSubmission={deleteSubmission}
              onDeleteClass={() => deleteClass(selectedClass)}
              onCreateStudentLink={() => createStudentLink(selectedClass.id)}
              onRerunWebCheck={rerunWebCheck}
            />
          )}

          <footer className="page-foot">
            <span>SIMILARITY IS A REVIEW SIGNAL, NOT A VERDICT.</span>
            <span>CHECKMATE / EDUCATOR WORKSPACE</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function AuthScreen({
  onSession,
  onError,
  error,
  theme,
  onToggleTheme,
}: {
  onSession: (session: Session) => void;
  onError: (message: string) => void;
  error: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = {
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
    };
    setBusy(true);
    onError('');
    try {
      const result = await fetch(
        `${API}/auth/${registering ? 'register' : 'login'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        },
      );
      const body = (await result.json()) as
        | Session
        | { message?: string | string[] };
      if (!result.ok) {
        const message = 'message' in body ? body.message : '';
        throw new Error(
          Array.isArray(message)
            ? message.join(' ')
            : message || `Could not ${registering ? 'create account' : 'sign in'}.`,
        );
      }
      onSession(body as Session);
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-showcase">
        <a className="brand-lockup" href="/" aria-label="CheckMate">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">CHECKMATE</span>
        </a>
        <div className="auth-display">
          <div className="display-topline">
            <span>SUBMISSION REVIEW / 001</span>
            <span>EDITION 01</span>
          </div>
          <div className="flap-title">
            <span>REVIEW</span>
            <span>THE WORK.</span>
          </div>
          <div className="display-rule" />
          <p>
            Compare class submissions. Follow the shared words. Make the call
            yourself.
          </p>
          <div className="display-bottomline">
            <span>CLASSROOM COMPARISON</span>
            <span className="amber-dot" />
          </div>
        </div>
        <p className="auth-footnote">
          YOUR DOCUMENTS STAY IN YOUR LOCAL WORKSPACE.
        </p>
      </div>

      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-top-actions">
            <span className="auth-top-spacer" />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
          <div className="auth-mobile-brand">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            CHECKMATE
          </div>
          <div className="auth-kicker">
            <span className="status-light" />
            EDUCATOR ACCESS
          </div>
          <h1>{registering ? 'Set up your desk.' : 'Welcome back.'}</h1>
          <p className="auth-intro">
            {registering
              ? 'Create a private workspace for the work you review.'
              : 'Sign in to continue reviewing your classes.'}
          </p>

          {error && (
            <div className="alert auth-alert" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="auth-form">
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                placeholder="you@school.edu"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={registering ? 'new-password' : 'current-password'}
                minLength={10}
                maxLength={72}
                placeholder="At least 10 characters"
                required
              />
              {registering && (
                <span className="field-hint">
                  Use 10 or more characters. Your password is stored securely.
                </span>
              )}
            </label>
            <button className="primary-button auth-submit" disabled={busy}>
              {busy
                ? 'Please wait…'
                : registering
                  ? 'Create educator account'
                  : 'Sign in'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>
          <p className="auth-switch">
            {registering ? 'Already have a workspace?' : 'New to CheckMate?'}
            <button
              onClick={() => {
                onError('');
                setRegistering((current) => !current);
              }}
            >
              {registering ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <div className="auth-trust">
            <ShieldCheck size={16} />
            <span>Private by design · Files stored on this server</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      <span>{nextTheme.toUpperCase()}</span>
    </button>
  );
}

function ClassBoard({
  classes,
  loading,
  onSelect,
  onCreate,
  onDelete,
}: {
  classes: Classroom[];
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (classroom: Classroom) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const filteredClasses = useMemo(
    () =>
      classes.filter((classroom) =>
        classroom.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [classes, search],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    await onCreate(name.trim());
    setName('');
    setCreating(false);
  }

  return (
    <>
      <div className="page-heading class-board-heading">
        <div>
          <div className="heading-meta">INSTRUCTOR DESK · CLASS INDEX</div>
          <h1>Your class board</h1>
          <p>Open a class to compare submissions and inspect shared passages.</p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={17} />
          New class
        </button>
      </div>

      {creating && (
        <form className="create-class-form" onSubmit={submit}>
          <label htmlFor="class-name">Class name</label>
          <input
            id="class-name"
            autoFocus
            maxLength={80}
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. English Literature · Period 3"
            required
          />
          <button className="primary-button" type="submit">
            Create class
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setCreating(false)}
          >
            Cancel
          </button>
        </form>
      )}

      <section className="board-section" aria-labelledby="classes-title">
        <div className="section-bar">
          <h2 id="classes-title">
            CLASS MANIFEST <span>{filteredClasses.length.toString().padStart(2, '0')}</span>
          </h2>
          <label className="search-control">
            <Search size={15} />
            <span className="sr-only">Filter classes</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter classes"
            />
          </label>
        </div>

        <div className="manifest-head class-manifest-head">
          <span>NO.</span>
          <span>CLASS / WORKSPACE</span>
          <span>SUBMISSIONS</span>
          <span>LAST ACTIVITY</span>
          <span aria-hidden="true" />
        </div>
        {filteredClasses.map((classroom, index) => (
          <div className="manifest-row class-manifest-row" key={classroom.id}>
            <span className="manifest-index">
              {(index + 1).toString().padStart(2, '0')}
            </span>
            <button
              className="manifest-name"
              onClick={() => onSelect(classroom.id)}
            >
              <span>{classroom.name}</span>
              <ArrowRight size={16} />
            </button>
            <span className="manifest-value">
              {classroom._count.documents.toString().padStart(2, '0')}
              <small> FILES</small>
            </span>
            <span className="manifest-muted">
              {formatDate(classroom.updatedAt)}
            </span>
            <button
              className="icon-button row-delete"
              onClick={() => onDelete(classroom)}
              aria-label={`Delete ${classroom.name}`}
              title="Delete class"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {!loading && classes.length === 0 && (
          <div className="empty-board">
            <div className="empty-board-mark" aria-hidden="true">
              <span>00</span>
              <span>— — — —</span>
              <span>OPEN CLASS</span>
            </div>
            <div>
              <h3>The board is clear.</h3>
              <p>
                Create a class to collect work and compare it with submissions
                from your other classes.
              </p>
              <button
                className="primary-button"
                onClick={() => setCreating(true)}
              >
                <Plus size={17} />
                Create your first class
              </button>
            </div>
          </div>
        )}
        {loading && <p className="loading-line">Reading the class board…</p>}
        {!loading && classes.length > 0 && filteredClasses.length === 0 && (
          <p className="loading-line">No classes match that search.</p>
        )}
      </section>

      <section className="how-section">
        <div className="how-heading">
          <span className="how-mark"><CircleHelp size={16} /></span>
          <div>
            <h2>How CheckMate compares work</h2>
            <p>
              Exact five-word phrases are compared against your instructor
              archive. Optional public-web checks surface sources to inspect;
              neither check establishes plagiarism.
            </p>
          </div>
        </div>
        <div className="how-step"><span>01</span><span>Upload named submissions</span><ArrowRight size={15} /></div>
        <div className="how-step"><span>02</span><span>Review shared text passages</span><ArrowRight size={15} /></div>
        <div className="how-step"><span>03</span><span>Use your own academic judgment</span><Check size={15} /></div>
      </section>
    </>
  );
}

function ClassWorkspace({
  classroom,
  report,
  comparison,
  loading,
  onBack,
  onUpload,
  onSelectComparison,
  onDeleteSubmission,
  onDeleteClass,
  onCreateStudentLink,
  onRerunWebCheck,
}: {
  classroom: Classroom;
  report: Report | null;
  comparison: Comparison | null;
  loading: boolean;
  onBack: () => void;
  onUpload: (files: File[], names: string[]) => Promise<void>;
  onSelectComparison: (id: string) => void;
  onDeleteSubmission: (submission: Submission) => void;
  onDeleteClass: () => void;
  onCreateStudentLink: () => Promise<string>;
  onRerunWebCheck: (submission: Submission) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareError, setShareError] = useState('');
  const [webCheckActionError, setWebCheckActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const [checkingSubmissionId, setCheckingSubmissionId] = useState('');
  const [selectedEvidenceSubmissionId, setSelectedEvidenceSubmissionId] =
    useState<string | null>(null);
  const selectedEvidenceSubmission =
    report?.submissions.find(
      (submission) => submission.id === selectedEvidenceSubmissionId,
    ) ?? null;
  const selectedDocumentMatches = selectedEvidenceSubmission
    ? (report?.comparisons ?? []).flatMap((pair) => {
        if (pair.left.id === selectedEvidenceSubmission.id) {
          return pair.matches.map((match, index) => ({
            id: `${pair.id}-${index}-left`,
            pageNumber: match.pageNumber,
            sourcePageNumber: match.sourcePageNumber,
            text: match.text,
            sourceText: match.sourceText,
            pageSimilarityPercent: match.pageSimilarityPercent,
            sourcePageSimilarityPercent: match.sourcePageSimilarityPercent,
            lineScorePercent: match.lineScorePercent,
            sourceLineScorePercent: match.sourceLineScorePercent,
            matchedPhraseCount: match.matchedPhraseCount,
            sourceName: `${pair.right.studentName} · ${pair.right.originalName}`,
          }));
        }
        if (pair.right.id === selectedEvidenceSubmission.id) {
          return pair.matches.map((match, index) => ({
            id: `${pair.id}-${index}-right`,
            pageNumber: match.sourcePageNumber,
            sourcePageNumber: match.pageNumber,
            text: match.sourceText,
            sourceText: match.text,
            pageSimilarityPercent: match.sourcePageSimilarityPercent,
            sourcePageSimilarityPercent: match.pageSimilarityPercent,
            lineScorePercent: match.sourceLineScorePercent,
            sourceLineScorePercent: match.lineScorePercent,
            matchedPhraseCount: match.matchedPhraseCount,
            sourceName: `${pair.left.studentName} · ${pair.left.originalName}`,
          }));
        }
        return [];
      })
    : [];

  async function generateStudentLink() {
    setSharing(true);
    setShareError('');
    setCopied(false);
    try {
      setShareLink(await onCreateStudentLink());
    } catch (reason) {
      setShareError((reason as Error).message);
    } finally {
      setSharing(false);
    }
  }

  async function copyStudentLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setShareError('');
    } catch {
      setShareError('Copy is unavailable here. Select and copy the link text.');
    }
  }

  return (
    <>
      <div className="workspace-back">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          All classes
        </button>
        <div className="heading-meta">CLASS FILE · {classroom.id.slice(0, 8).toUpperCase()}</div>
      </div>
      <div className="page-heading workspace-heading">
        <div>
          <h1>{classroom.name}</h1>
          <p>
            {report?.submissions.length ?? classroom._count.documents} submissions
            <span className="heading-separator">·</span>
            Compared with this instructor’s submission archive
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary-button"
            onClick={() => void generateStudentLink()}
            disabled={sharing}
          >
            <ArrowRight size={16} />
            {sharing ? 'Creating link…' : 'Student link'}
          </button>
          <button
            className="secondary-button"
            onClick={onDeleteClass}
            title="Delete this class and its files"
          >
            <Trash2 size={16} />
            Delete class
          </button>
          <button
            className="primary-button"
            onClick={() => setUploading((current) => !current)}
          >
            {uploading ? <X size={16} /> : <Upload size={16} />}
            {uploading ? 'Close upload' : 'Add submissions'}
          </button>
        </div>
      </div>

      {(shareLink || shareError) && (
        <section className="share-link-panel" aria-label="Student submission link">
          <div>
            <div className="heading-meta">STUDENT SUBMISSION ACCESS</div>
            <p>
              Anyone with this link can submit one document using their name.
              They cannot view class submissions or reports. Creating a new link
              here invalidates the previous one.
            </p>
            {shareLink && <code>{shareLink}</code>}
            {shareError && <span className="share-error" role="alert">{shareError}</span>}
          </div>
          {shareLink && (
            <button className="secondary-button" onClick={() => void copyStudentLink()}>
              {copied ? <Check size={16} /> : <ArrowRight size={16} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          )}
        </section>
      )}

      {uploading && (
        <UploadPanel
          onUpload={onUpload}
          onClose={() => setUploading(false)}
        />
      )}

      <div className="review-workspace">
        <section className="submission-panel" aria-labelledby="submissions-title">
          <div className="section-bar">
            <h2 id="submissions-title">
              SUBMISSION MANIFEST{' '}
              <span>{(report?.submissions.length ?? 0).toString().padStart(2, '0')}</span>
            </h2>
            <button className="subtle-control" onClick={() => setUploading(true)}>
              <Plus size={15} /> Add files
            </button>
          </div>
          <div className="manifest-head submission-manifest-head">
            <span>STUDENT</span>
            <span>DOCUMENT</span>
            <span>PAGE SCORE</span>
            <span>RECEIVED</span>
            <span aria-hidden="true" />
          </div>
          {report?.submissions.map((submission, index) => (
            <div className="manifest-row submission-row" key={submission.id}>
              <span className="student-name">
                <span className="student-index">{(index + 1).toString().padStart(2, '0')}</span>
                {submission.studentName}
              </span>
              <span className="document-name">
                <FileText size={15} />
                <span>{submission.originalName}</span>
              </span>
              <button
                className="submission-score"
                onClick={() =>
                  setSelectedEvidenceSubmissionId(submission.id)
                }
                aria-label={`View evidence for ${submission.originalName}: ${submission.similarityPercent}% of pages flagged`}
              >
                <strong>{submission.similarityPercent}%</strong>
                <small>
                  {submission.matchedPageCount}/{submission.pageCount} pages
                </small>
              </button>
              <span className="manifest-muted">{formatDate(submission.createdAt)}</span>
              <button
                className="icon-button row-delete"
                onClick={() => onDeleteSubmission(submission)}
                aria-label={`Remove ${submission.studentName}'s submission`}
                title="Remove submission"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!loading && report?.submissions.length === 0 && (
            <div className="empty-submissions">
              <div className="empty-line" />
              <p>No submissions in this class yet.</p>
              <button className="text-link" onClick={() => setUploading(true)}>
                Add the first submission <ArrowRight size={15} />
              </button>
            </div>
          )}
          {loading && <p className="loading-line">Loading class submissions…</p>}
        </section>

        <section className="comparison-panel" aria-labelledby="comparisons-title">
          <div className="section-bar comparison-bar">
            <h2 id="comparisons-title">
              PAIR CHECK <span>{(report?.comparisons.length ?? 0).toString().padStart(2, '0')}</span>
            </h2>
            <span className="pair-scope">INSTRUCTOR ARCHIVE</span>
          </div>
          <div className="pair-list">
            {report?.comparisons.map((pair, index) => (
              <button
                className={`pair-row ${
                  comparison?.id === pair.id ? 'is-selected' : ''
                }`}
                key={pair.id}
                onClick={() => onSelectComparison(pair.id)}
              >
                <span className="pair-number">{(index + 1).toString().padStart(2, '0')}</span>
                <span className="pair-names">
                  <span>
                    {pair.left.studentName}
                    <small className="pair-class-name">{pair.left.classroomName}</small>
                  </span>
                  <span className="pair-join">with</span>
                  <span>
                    {pair.right.studentName}
                    <small className="pair-class-name">{pair.right.classroomName}</small>
                  </span>
                </span>
                <span
                  className={`pair-percent ${
                    pair.similarityPercent > 0 ? 'has-overlap' : ''
                  }`}
                >
                  {pair.similarityPercent}
                  <small>%</small>
                </span>
                <ChevronDown size={14} className="pair-chevron" />
              </button>
            ))}
          </div>
          {!loading && report?.submissions.length === 1 && report.comparisons.length === 0 && (
            <div className="pair-empty">
              <span className="pair-empty-code">1 : 0</span>
              <p>No prior submissions are available in this instructor’s archive yet.</p>
            </div>
          )}
          {!loading && report?.submissions.length === 0 && (
            <div className="pair-empty">
              <span className="pair-empty-code">0 : 0</span>
              <p>Pair comparisons appear after work is uploaded.</p>
            </div>
          )}
        </section>

        <section className="web-sources-panel" aria-labelledby="web-sources-title">
          <div className="section-bar">
            <h2 id="web-sources-title">
              PUBLIC WEB CHECK <span>{(report?.submissions.length ?? 0).toString().padStart(2, '0')}</span>
            </h2>
            <span className="pair-scope">BRAVE SEARCH</span>
          </div>
          <p className="web-search-notice">
            Up to three short excerpts are searched. The entered student name,
            filename, and file metadata are not sent to Brave.
          </p>
          {webCheckActionError && (
            <p className="web-check-message" role="alert">{webCheckActionError}</p>
          )}
          <div className="web-check-list">
            {report?.submissions.map((submission) => (
              <article className="web-check-item" key={submission.id}>
                <div className="web-check-heading">
                  <div>
                    <strong>{submission.studentName}</strong>
                    <small>{submission.originalName}</small>
                  </div>
                  <span className={`web-check-status status-${submission.webSearchStatus.toLowerCase()}`}>
                    {submission.webSearchStatus.replace('_', ' ')}
                  </span>
                </div>
                {submission.webSearchError && (
                  <p className="web-check-message" role="status">
                    {submission.webSearchError}
                  </p>
                )}
                {submission.webSearchStatus === 'COMPLETE' &&
                  submission.webSearchResults.length === 0 && (
                    <p className="web-check-message">No public source leads were returned.</p>
                  )}
                {submission.webSearchResults.map((source) => (
                  <div className="web-source" key={`${submission.id}-${source.url}`}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    <p>{source.description}</p>
                    <small>Excerpt searched: “{source.matchedPhrase}”</small>
                  </div>
                ))}
                {submission.webSearchStatus !== 'SKIPPED' && (
                  <button
                    className="text-link web-check-retry"
                    disabled={checkingSubmissionId === submission.id}
                    onClick={() => {
                      setCheckingSubmissionId(submission.id);
                      setWebCheckActionError('');
                      void onRerunWebCheck(submission)
                        .catch((reason: Error) => setWebCheckActionError(reason.message))
                        .finally(() => setCheckingSubmissionId(''));
                    }}
                  >
                    {checkingSubmissionId === submission.id ? 'Checking…' : 'Run check again'}
                    {checkingSubmissionId !== submission.id && <ArrowRight size={14} />}
                  </button>
                )}
              </article>
            ))}
            {!loading && report?.submissions.length === 0 && (
              <p className="web-check-message">Public web checks appear after a document is submitted.</p>
            )}
          </div>
        </section>

        <section className="evidence-panel" aria-labelledby="evidence-title">
          <div className="evidence-header">
            <div>
              <div className="heading-meta">PAGE MATCHES · HUMAN REVIEW</div>
              <h2 id="evidence-title">
                {selectedEvidenceSubmission
                  ? selectedEvidenceSubmission.originalName
                  : comparison
                  ? `${comparison.left.studentName} × ${comparison.right.studentName}`
                  : 'Evidence desk'}
              </h2>
            </div>
            <div className="evidence-stamp">
              <span>
                {selectedEvidenceSubmission
                  ? `${selectedEvidenceSubmission.similarityPercent}%`
                  : `${comparison?.similarityPercent ?? 0}%`}
              </span>
              <small>
                {selectedEvidenceSubmission
                  ? `${selectedEvidenceSubmission.matchedPageCount}/${selectedEvidenceSubmission.pageCount} PAGES`
                  : `${comparison?.matchedPageCount ?? 0}/${comparison?.pageCount ?? 0} PAGES`}
              </small>
            </div>
          </div>
          {selectedEvidenceSubmission ? (
            <>
              <p className="evidence-score-explainer">
                {selectedEvidenceSubmission.matchedPageCount} of{' '}
                {selectedEvidenceSubmission.pageCount} pages have an archive
                match or public-web source lead. This is a review signal, not a
                finding of plagiarism.
              </p>
              <div className="document-evidence-list">
                {selectedDocumentMatches.map((match) => (
                  <article className="document-evidence-item" key={match.id}>
                    <div className="evidence-match-meta">
                      <strong>PAGE {match.pageNumber}</strong>
                      <span>
                        {match.lineScorePercent}% passage ·{' '}
                        {match.pageSimilarityPercent}% page
                      </span>
                    </div>
                    <p className="matched-passage">
                      <mark>{match.text}</mark>
                    </p>
                    <p className="evidence-source-label">
                      Archive source: {match.sourceName} · page{' '}
                      {match.sourcePageNumber} · {match.matchedPhraseCount}{' '}
                      shared exact phrases
                    </p>
                  </article>
                ))}
                {selectedEvidenceSubmission.webSearchResults.map((source) => (
                  <article
                    className="document-evidence-item"
                    key={`${source.url}-${source.pageNumber}`}
                  >
                    <div className="evidence-match-meta">
                      <strong>{formatPage(source.pageNumber)}</strong>
                      <span>PUBLIC WEB SOURCE LEAD</span>
                    </div>
                    <p className="matched-passage">
                      <mark>{source.matchedPhrase}</mark>
                    </p>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    <p className="evidence-source-label">{source.description}</p>
                  </article>
                ))}
                {selectedDocumentMatches.length === 0 &&
                  selectedEvidenceSubmission.webSearchResults.length === 0 && (
                    <p className="no-overlap">
                      No matches are available for this document yet. Public
                      search status: {selectedEvidenceSubmission.webSearchStatus}.
                    </p>
                  )}
              </div>
              <div className="evidence-footnote">
                <ShieldCheck size={15} />
                <span>{report?.method.caveat}</span>
              </div>
            </>
          ) : comparison ? (
            <>
              <div className="evidence-columns">
                <article className="evidence-document">
                  <div className="document-label">
                    <span>A</span>
                    <div>
                      <strong>{comparison.left.studentName}</strong>
                      <small>{comparison.left.classroomName} · {comparison.left.originalName}</small>
                    </div>
                  </div>
                  {comparison.matches.map((match, index) => (
                    <div className="pair-evidence-match" key={`left-${index}`}>
                      <small>
                        PAGE {match.pageNumber} · {match.lineScorePercent}%
                        PASSAGE · {match.pageSimilarityPercent}% PAGE
                      </small>
                      <p className="matched-passage">
                        <mark>{match.text}</mark>
                      </p>
                    </div>
                  ))}
                </article>
                <article className="evidence-document">
                  <div className="document-label">
                    <span>B</span>
                    <div>
                      <strong>{comparison.right.studentName}</strong>
                      <small>{comparison.right.classroomName} · {comparison.right.originalName}</small>
                    </div>
                  </div>
                  {comparison.matches.map((match, index) => (
                    <div className="pair-evidence-match" key={`right-${index}`}>
                      <small>
                        PAGE {match.sourcePageNumber} · {match.sourceLineScorePercent}%
                        PASSAGE · {match.sourcePageSimilarityPercent}% PAGE
                      </small>
                      <p className="matched-passage">
                        <mark>{match.sourceText}</mark>
                      </p>
                    </div>
                  ))}
                </article>
              </div>
              {comparison.matches.length === 0 && (
                <p className="no-overlap">
                  No shared exact five-word phrases were found in these submissions.
                </p>
              )}
              <div className="evidence-footnote">
                <ShieldCheck size={15} />
                <span>
                  {comparison.matchedPageCount} of {comparison.pageCount} pages
                  in {comparison.left.studentName} contain one or more exact
                  archive matches. {report?.method.caveat}
                </span>
              </div>
            </>
          ) : (
            <div className="evidence-empty">
              <div className="evidence-empty-art" aria-hidden="true">
                <span>A</span><i /><span>B</span>
              </div>
              <p>Select a pair to inspect exact shared phrases.</p>
              <small>Matches can come from any class in your instructor archive.</small>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function UploadPanel({
  onUpload,
  onClose,
}: {
  onUpload: (files: File[], names: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');

  function selectFiles(fileList: FileList | null) {
    const selected = fileList ? Array.from(fileList) : [];
    setFiles(selected);
    setNames(selected.map(() => ''));
    setUploadError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setUploadError('Choose at least one PDF or DOCX file.');
      return;
    }
    if (files.some((file) => file.size > 25 * 1024 * 1024)) {
      setUploadError('Each file must be 25 MB or smaller.');
      return;
    }
    if (names.some((name) => !name.trim())) {
      setUploadError('Enter a student name for every selected file.');
      return;
    }
    setBusy(true);
    setUploadError('');
    try {
      await onUpload(files, names.map((name) => name.trim()));
      onClose();
    } catch (reason) {
      setUploadError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="upload-panel" onSubmit={submit}>
      <div className="upload-panel-heading">
        <div>
          <div className="heading-meta">CLASS INTAKE</div>
          <h2>Bring work to the board.</h2>
          <p>PDF and DOCX · up to 25 MB per file · up to 10 files at a time</p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close upload panel"
        >
          <X size={18} />
        </button>
      </div>
      <label className="file-picker">
        <Upload size={18} />
        <span>{files.length ? `${files.length} files selected` : 'Choose PDF or DOCX files'}</span>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          onChange={(event) => selectFiles(event.currentTarget.files)}
        />
        <small>Browse files</small>
      </label>
      {files.map((file, index) => (
        <div className="upload-file-row" key={`${file.name}-${index}`}>
          <FileText size={17} />
          <span className="upload-file-name">{file.name}</span>
          <span className="upload-file-size">{formatSize(file.size)}</span>
          <label className="student-name-input">
            <span className="sr-only">Student name for {file.name}</span>
            <input
              value={names[index] ?? ''}
              maxLength={120}
              onChange={(event) =>
                setNames((current) =>
                  current.map((name, nameIndex) =>
                    index === nameIndex ? event.target.value : name,
                  ),
                )
              }
              placeholder="Student name"
              required
            />
          </label>
        </div>
      ))}
      {uploadError && (
        <div className="upload-error" role="alert">
          {uploadError}
        </div>
      )}
      <div className="upload-footer">
        <p>
          <ShieldCheck size={15} />
          Stored locally. Up to three short excerpts are sent to Brave Search;
          entered names, filenames, and file metadata are excluded.
        </p>
        <button
          className="primary-button"
          type="submit"
          disabled={busy || files.length === 0}
        >
          {busy ? 'Reading documents…' : `Add ${files.length || ''} ${files.length === 1 ? 'submission' : 'submissions'}`}
          {!busy && <ArrowRight size={16} />}
        </button>
      </div>
    </form>
  );
}

function StudentResultsPage({
  receiptToken,
  theme,
  onToggleTheme,
}: {
  receiptToken: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [receipt, setReceipt] = useState<StudentReceipt | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const selectedSubmission =
    receipt?.submissions.find(
      (submission) => submission.id === selectedSubmissionId,
    ) ?? receipt?.submissions[0] ?? null;

  useEffect(() => {
    let active = true;
    void requestPublic<StudentReceipt>(
      `/public/submissions/receipt/${receiptToken}`,
    )
      .then((result) => {
        if (active) {
          setReceipt(result);
          setSelectedSubmissionId((current) =>
            current && result.submissions.some((item) => item.id === current)
              ? current
              : (result.submissions[0]?.id ?? null),
          );
          setError('');
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [receiptToken]);

  useEffect(() => {
    if (!receipt?.submissions.some((item) => item.webSearchStatus === 'PENDING')) {
      return;
    }
    const interval = window.setInterval(() => {
      void requestPublic<StudentReceipt>(
        `/public/submissions/receipt/${receiptToken}`,
      )
        .then(setReceipt)
        .catch((reason: Error) => setError(reason.message));
    }, 7000);
    return () => window.clearInterval(interval);
  }, [receipt, receiptToken]);

  return (
    <main className="student-submit-page student-results-page">
      <header className="student-submit-topbar">
        <a className="brand-lockup" href="/" aria-label="CheckMate home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">CHECKMATE</span>
        </a>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <div className="student-results-layout">
        <div className="student-results-heading">
          <div className="heading-meta">PRIVATE SUBMISSION RECEIPT</div>
          <h1>{receipt?.classroomName ?? 'Your review results'}</h1>
          <p>
            Review scores and source details for the documents in this private
            receipt. Do not share this page; its link grants access to these
            results.
          </p>
        </div>
        {error && <div className="alert" role="alert">{error}</div>}
        {loading && <p className="loading-line">Loading your evidence…</p>}
        {receipt && (
          <div className="student-results-grid">
            <section className="student-results-list" aria-label="Your documents">
              <h2>DOCUMENT SUMMARY</h2>
              {receipt.submissions.map((submission) => (
                <button
                  className={`student-result-row ${
                    selectedSubmission?.id === submission.id ? 'is-selected' : ''
                  }`}
                  key={submission.id}
                  onClick={() => setSelectedSubmissionId(submission.id)}
                >
                  <span className="student-result-file">
                    <FileText size={16} />
                    <span>
                      <strong>{submission.originalName}</strong>
                      <small>
                        {submission.matchedPageCount} of {submission.pageCount}{' '}
                        pages with potential matches
                      </small>
                    </span>
                  </span>
                  <span className="student-result-score">
                    {submission.similarityPercent}%
                    <small>PAGE SCORE</small>
                  </span>
                </button>
              ))}
            </section>
            {selectedSubmission && (
              <section className="student-result-detail" aria-live="polite">
                <div className="student-result-detail-heading">
                  <div>
                    <div className="heading-meta">DOCUMENT REVIEW</div>
                    <h2>{selectedSubmission.originalName}</h2>
                  </div>
                  <span className="student-result-detail-score">
                    {selectedSubmission.similarityPercent}%
                    <small>
                      {selectedSubmission.matchedPageCount}/
                      {selectedSubmission.pageCount} PAGES
                    </small>
                  </span>
                </div>
                <p className="student-result-caveat">
                  {receipt.method}
                </p>
                <div className="student-result-sources">
                  <h3>
                    ARCHIVE MATCHES{' '}
                    <span>{selectedSubmission.archiveMatches.length}</span>
                  </h3>
                  {selectedSubmission.archiveMatches.map((match, index) => (
                    <article
                      className="student-result-match"
                      key={`${match.pageNumber}-${index}`}
                    >
                      <div className="evidence-match-meta">
                        <strong>PAGE {match.pageNumber}</strong>
                        <span>
                          {match.lineScorePercent}% passage ·{' '}
                          {match.pageSimilarityPercent}% page
                        </span>
                      </div>
                      <p className="matched-passage"><mark>{match.text}</mark></p>
                      <small>
                        {match.matchedPhraseCount} exact five-word archive
                        patterns · {match.source}
                      </small>
                    </article>
                  ))}
                  {selectedSubmission.archiveMatches.length === 0 && (
                    <p className="web-check-message">
                      No exact phrase matches in the instructor’s submission archive.
                    </p>
                  )}
                </div>
                <div className="student-result-sources">
                  <h3>
                    PUBLIC WEB LEADS{' '}
                    <span>{selectedSubmission.webSearchResults.length}</span>
                  </h3>
                  <p className="web-check-message">
                    Search status: {selectedSubmission.webSearchStatus}
                    {selectedSubmission.webSearchError
                      ? ` · ${selectedSubmission.webSearchError}`
                      : ''}
                  </p>
                  {selectedSubmission.webSearchResults.map((source) => (
                    <article
                      className="student-result-match"
                      key={`${source.url}-${source.pageNumber}`}
                    >
                      <div className="evidence-match-meta">
                        <strong>{formatPage(source.pageNumber)}</strong>
                        <span>PUBLIC SOURCE LEAD</span>
                      </div>
                      <p className="matched-passage">
                        <mark>{source.matchedPhrase}</mark>
                      </p>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                      <p className="evidence-source-label">{source.description}</p>
                    </article>
                  ))}
                  {selectedSubmission.webSearchStatus === 'COMPLETE' &&
                    selectedSubmission.webSearchResults.length === 0 && (
                      <p className="web-check-message">
                        No public source leads were returned for the searched excerpts.
                      </p>
                    )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function StudentSubmissionPage({
  code,
  theme,
  onToggleTheme,
}: {
  code: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [classroomName, setClassroomName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentName, setStudentName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [webCheckConsent, setWebCheckConsent] = useState(false);

  useEffect(() => {
    let active = true;
    void requestPublic<{ name: string }>(`/public/submissions/${code}`)
      .then((classroom) => {
        if (active) setClassroomName(classroom.name);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setError('Choose at least one PDF or DOCX document to submit.');
      return;
    }
    if (files.length > 10) {
      setError('Submit no more than 10 documents at a time.');
      return;
    }
    if (files.some((file) => file.size > 25 * 1024 * 1024)) {
      setError('Each document must be 25 MB or smaller.');
      return;
    }
    setSubmitting(true);
    setError('');
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    form.append('studentName', studentName.trim());
    form.append('webCheckConsent', String(webCheckConsent));
    try {
      const result = await requestPublic<{ receiptToken: string }>(
        `/public/submissions/${code}`,
        {
        method: 'POST',
        body: form,
        },
      );
      window.location.assign(`/results/${result.receiptToken}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="student-submit-page">
      <header className="student-submit-topbar">
        <a className="brand-lockup" href="/" aria-label="CheckMate home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">CHECKMATE</span>
        </a>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <div className="student-submit-layout">
        <section className="student-submit-intro">
          <div className="heading-meta">STUDENT SUBMISSION · CLASS INTAKE</div>
          <h1>{loading ? 'Opening the class board…' : classroomName || 'Submission link unavailable'}</h1>
          {!error && (
            <p>
              Send your documents directly to your instructor’s class. Your
              instructor will review it alongside other class submissions.
            </p>
          )}
          <div className="student-submit-note">
            <ShieldCheck size={16} />
            <span>
              Your private receipt shows only the documents you submit and
              their review details; it never exposes other students’ reports.
            </span>
          </div>
        </section>

        <section className="student-submit-form-wrap">
          <>
              <div className="student-form-heading">
                <div className="heading-meta">CLASS FILE · {classroomName || '—'}</div>
                <h2>Submit your work.</h2>
                <p>Up to 10 PDFs or DOCX files · 25 MB each</p>
              </div>
              {error && (
                <div className="alert" role="alert">
                  <span>{error}</span>
                </div>
              )}
              {!loading && classroomName && !error && (
                <form className="student-submit-form" onSubmit={submit}>
                  <label>
                    Your name
                    <input
                      autoComplete="name"
                      maxLength={120}
                      value={studentName}
                      onChange={(event) => setStudentName(event.target.value)}
                      placeholder="First and last name"
                      required
                    />
                  </label>
                  <label className="student-file-picker">
                    <FileText size={18} />
                    <span>
                      {files.length
                        ? `${files.length} document${files.length === 1 ? '' : 's'} selected`
                        : 'Choose your documents'}
                    </span>
                    <input
                       type="file"
                       multiple
                       accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                       onChange={(event) => {
                         setFiles(Array.from(event.currentTarget.files ?? []));
                         setError('');
                       }}
                       required
                     />
                     <small>Browse</small>
                   </label>
                   {files.map((file, index) => (
                     <div
                       className="student-file-detail"
                       key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                     >
                       <span title={file.name}>{file.name}</span>
                       <span>{formatSize(file.size)}</span>
                     </div>
                   ))}
                  <label className="web-check-consent">
                    <input
                      type="checkbox"
                      checked={webCheckConsent}
                      onChange={(event) => setWebCheckConsent(event.target.checked)}
                    />
                    <span>
                      I agree to a public web check. Up to three short excerpts
                      from my document will be sent to Brave Search; my name,
                      filename, and file metadata will not be sent. I can submit
                      without the web check.
                    </span>
                  </label>
                  <button
                    className="primary-button student-submit-button"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Reading your documents…' : 'Submit to class'}
                    {!submitting && <ArrowRight size={17} />}
                  </button>
                </form>
              )}
          </>
        </section>
        <footer className="student-submit-footer">
          CHECKMATE · SIMILARITY IS A REVIEW SIGNAL, NOT A VERDICT.
        </footer>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(new Date(value));
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPage(pageNumber: number) {
  return pageNumber > 0 ? `PAGE ${pageNumber}` : 'PAGE UNMAPPED';
}

export default App;
