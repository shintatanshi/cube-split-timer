import { useCallback, useEffect, useMemo, useState } from "react";
import { isAuthConfigured, type AuthUser } from "../lib/auth";
import {
  getAdminProfiles,
  getAdminSolveSessions,
  getMyProfile,
  sendUserPasswordResetEmail,
  updateProfileRole,
  type ProfileRow,
} from "../lib/admin";
import type { ProfileRole } from "../lib/supabase";
import type { SolveSessionRow } from "../lib/solveSessions";
import { formatDateTime, formatTime } from "../lib/time";

interface AdminPageProps {
  user: AuthUser | null;
  onOpenLogin: () => void;
  onOpenTimer: () => void;
}

type AdminStatus = "idle" | "loading" | "success" | "error";

function getProfileLabel(profile: ProfileRow | null | undefined): string {
  if (!profile) {
    return "Unknown user";
  }

  const name = profile.display_name?.trim() || profile.email || profile.id;

  return profile.public_id ? `${name} (@${profile.public_id})` : name;
}

function getSolveDisplayTime(solve: SolveSessionRow): string {
  return solve.is_dnf ? "DNF" : formatTime(solve.total_ms);
}

function getSolveCountByUser(solves: SolveSessionRow[]): Map<string, number> {
  return solves.reduce((counts, solve) => {
    counts.set(solve.user_id, (counts.get(solve.user_id) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function getRoleLabel(role: ProfileRole): string {
  return role === "admin" ? "管理者" : "一般";
}

export default function AdminPage({ user, onOpenLogin, onOpenTimer }: AdminPageProps) {
  const [currentProfile, setCurrentProfile] = useState<ProfileRow | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [solves, setSolves] = useState<SolveSessionRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [status, setStatus] = useState<AdminStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [actionStatus, setActionStatus] = useState<AdminStatus>("idle");
  const [actionMessage, setActionMessage] = useState("");
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const solveCountByUser = useMemo(() => getSolveCountByUser(solves), [solves]);
  const filteredSolves = useMemo(
    () =>
      selectedUserId === "all"
        ? solves
        : solves.filter((solve) => solve.user_id === selectedUserId),
    [selectedUserId, solves],
  );

  const loadAdminData = useCallback(async () => {
    if (!user || !isAuthConfigured()) {
      setCurrentProfile(null);
      setProfiles([]);
      setSolves([]);
      return;
    }

    setStatus("loading");
    setStatusMessage("管理者情報を読み込んでいます。");

    try {
      const profile = await getMyProfile();
      setCurrentProfile(profile);

      if (profile?.role !== "admin") {
        setProfiles([]);
        setSolves([]);
        setStatus("error");
        setStatusMessage("このページは管理者だけが開けます。");
        return;
      }

      const [nextProfiles, nextSolves] = await Promise.all([
        getAdminProfiles(),
        getAdminSolveSessions({ includeDeleted: true, limit: 500 }),
      ]);

      setProfiles(nextProfiles);
      setSolves(nextSolves);
      setStatus("success");
      setStatusMessage(
        `ユーザー ${nextProfiles.length}件 / 履歴 ${nextSolves.length}件を読み込みました。`,
      );
    } catch {
      setStatus("error");
      setStatusMessage("管理者データを読み込めませんでした。RLSとSupabase設定を確認してください。");
    }
  }, [user]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const handleRoleChange = async (profile: ProfileRow, role: ProfileRole) => {
    if (profile.id === user?.id) {
      setActionStatus("error");
      setActionMessage("自分自身の管理者権限はこの画面から変更できません。");
      return;
    }

    const nextLabel = getRoleLabel(role);
    const confirmed = window.confirm(`${getProfileLabel(profile)} を「${nextLabel}」に変更しますか？`);

    if (!confirmed) {
      return;
    }

    setBusyProfileId(profile.id);
    setActionStatus("loading");
    setActionMessage("権限を更新しています。");

    try {
      const updatedProfile = await updateProfileRole(profile.id, role);
      setProfiles((currentProfiles) =>
        currentProfiles.map((currentProfile) =>
          currentProfile.id === updatedProfile.id ? updatedProfile : currentProfile,
        ),
      );
      setActionStatus("success");
      setActionMessage(`${getProfileLabel(updatedProfile)} を「${nextLabel}」に変更しました。`);
    } catch {
      setActionStatus("error");
      setActionMessage("権限を変更できませんでした。RLSと管理者権限を確認してください。");
    } finally {
      setBusyProfileId(null);
    }
  };

  const handlePasswordReset = async (profile: ProfileRow) => {
    if (!profile.email) {
      setActionStatus("error");
      setActionMessage("このユーザーには送信先メールアドレスがありません。");
      return;
    }

    const confirmed = window.confirm(`${profile.email} にパスワード再設定メールを送りますか？`);

    if (!confirmed) {
      return;
    }

    setBusyProfileId(profile.id);
    setActionStatus("loading");
    setActionMessage("パスワード再設定メールを送信しています。");

    try {
      await sendUserPasswordResetEmail(profile.email);
      setActionStatus("success");
      setActionMessage(`${profile.email} にパスワード再設定メールを送信しました。`);
    } catch {
      setActionStatus("error");
      setActionMessage("再設定メールを送信できませんでした。Supabase Auth設定を確認してください。");
    } finally {
      setBusyProfileId(null);
    }
  };

  if (!isAuthConfigured()) {
    return (
      <main className="app-shell admin-page">
        <header className="app-header admin-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>管理者画面</h1>
          </div>
          <button className="primary-button" type="button" onClick={onOpenTimer}>
            Timerへ戻る
          </button>
        </header>
        <section className="admin-card">
          <h2>Supabaseが未設定です</h2>
          <p>管理者機能には `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` が必要です。</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell admin-page">
        <header className="app-header admin-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>管理者画面</h1>
          </div>
          <button className="ghost-button" type="button" onClick={onOpenTimer}>
            Timerへ戻る
          </button>
        </header>
        <section className="admin-card">
          <h2>ログインしてください</h2>
          <p>管理者機能を使うには、管理者権限のあるアカウントでログインしてください。</p>
          <button className="primary-button" type="button" onClick={onOpenLogin}>
            ログインへ
          </button>
        </section>
      </main>
    );
  }

  const isAdmin = currentProfile?.role === "admin";

  return (
    <main className="app-shell admin-page">
      <header className="app-header admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>管理者画面</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={() => void loadAdminData()}>
            再読み込み
          </button>
          <button className="primary-button" type="button" onClick={onOpenTimer}>
            Timerへ戻る
          </button>
        </div>
      </header>

      {status !== "idle" && (
        <div className={`feedback-status feedback-status-${status}`} role="status">
          {statusMessage}
        </div>
      )}

      {actionStatus !== "idle" && (
        <div className={`feedback-status feedback-status-${actionStatus}`} role="status">
          {actionMessage}
        </div>
      )}

      <section className="admin-card admin-warning-card" aria-label="Password policy">
        <div>
          <p className="eyebrow">Password Safety</p>
          <h2>パスワードは表示しません</h2>
        </div>
        <p>
          Supabase Authのパスワードは平文で取得できません。管理者でも見る機能は作らず、
          必要な場合はユーザーへ再設定メールを送ります。
        </p>
      </section>

      {!isAdmin ? (
        <section className="admin-card">
          <h2>権限がありません</h2>
          <p>このアカウントには管理者権限がありません。</p>
        </section>
      ) : (
        <>
          <section className="admin-card" aria-label="Users">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Users</p>
                <h2>ユーザーと権限</h2>
              </div>
              <span className="admin-count">{profiles.length} users</span>
            </div>

            <div className="admin-user-list">
              {profiles.map((profile) => {
                const isSelf = profile.id === user.id;
                const nextRole: ProfileRole = profile.role === "admin" ? "user" : "admin";
                const isBusy = busyProfileId === profile.id;

                return (
                  <article className="admin-user-card" key={profile.id}>
                    <div className="admin-user-main">
                      <div>
                        <h3>{getProfileLabel(profile)}</h3>
                        <p>{profile.email ?? "メール未設定"}</p>
                      </div>
                      <span className={`admin-role-badge admin-role-${profile.role}`}>
                        {getRoleLabel(profile.role)}
                      </span>
                    </div>

                    <div className="admin-user-meta">
                      <span>ID {profile.id}</span>
                      <span>登録 {formatDateTime(profile.created_at)}</span>
                      <span>履歴 {solveCountByUser.get(profile.id) ?? 0}件</span>
                    </div>

                    <div className="admin-user-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={isSelf || isBusy}
                        onClick={() => void handleRoleChange(profile, nextRole)}
                      >
                        {profile.role === "admin" ? "一般に戻す" : "管理者にする"}
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={!profile.email || isBusy}
                        onClick={() => void handlePasswordReset(profile)}
                      >
                        再設定メール
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="admin-card" aria-label="Solve history">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cloud History</p>
                <h2>ユーザー履歴</h2>
              </div>
              <label className="admin-filter">
                表示
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  <option value="all">すべてのユーザー</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {getProfileLabel(profile)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="admin-help-text">
              表示されるのはSupabaseに保存済みの履歴です。各端末だけに残っているローカル履歴は、
              そのユーザーがAccount画面またはログイン時にアップロードすると表示されます。
            </p>

            {filteredSolves.length === 0 ? (
              <div className="empty-state">
                <p>履歴がありません。</p>
                <span>条件を変えるか、ユーザーのクラウド保存を確認してください。</span>
              </div>
            ) : (
              <ol className="admin-solve-list">
                {filteredSolves.map((solve) => {
                  const profile = profileById.get(solve.user_id);

                  return (
                    <li className="admin-solve-item" key={solve.id}>
                      <div className="admin-solve-main">
                        <div>
                          <p className="history-time">
                            {getSolveDisplayTime(solve)}
                            {solve.is_deleted && <span> deleted</span>}
                          </p>
                          <p className="history-meta">
                            <span className="mode-badge">{solve.mode}</span>
                            {formatDateTime(solve.created_at)}
                          </p>
                        </div>
                        <div className="admin-solve-user">
                          <strong>{getProfileLabel(profile)}</strong>
                          <span>{profile?.email ?? solve.user_id}</span>
                        </div>
                      </div>

                      <p className="history-scramble">{solve.scramble}</p>

                      <div className="history-splits" aria-label="Cloud solve details">
                        {solve.cross_ms !== null && <span>Cross {formatTime(solve.cross_ms)}</span>}
                        {solve.f2l_ms !== null && <span>F2L {formatTime(solve.f2l_ms)}</span>}
                        {solve.oll_ms !== null && <span>OLL {formatTime(solve.oll_ms)}</span>}
                        {solve.pll_ms !== null && <span>PLL {formatTime(solve.pll_ms)}</span>}
                        {solve.notes && <span>{solve.notes}</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}
