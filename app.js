
/*
 * ResumeVault - Supabase-connected frontend
 * Self-service recruiter registration
 * Individual recruiter candidate-data isolation
 *
 * Frontend must use ONLY the Supabase Publishable Key.
 */

const SUPABASE_URL = "https://qejdevxzxdakstsxwscq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2oF5fMOnLCW0j55nMiIfVQ_WK6ZBIrZ";

const BUCKET = "candidate-resumes";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx"];

const $ = id => document.getElementById(id);

const configured =
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_");

let supabaseClient = null;
let currentUser = null;
let teamId = null;
let candidates = [];

// ==========================================
// GENERAL HELPERS
// ==========================================

function message(id, text, type = "") {
    const el = $(id);
    if (!el) return;

    el.textContent = text;
    el.className = `form-message ${type}`.trim();
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[ch]));
}

function safeFileName(name) {
    return name.normalize("NFKD")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-120) || "resume";
}

function fileExtension(name) {
    return String(name).split(".").pop().toLowerCase();
}

function formatDate(value) {
    return new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function setBusy(button, busy, label) {
    if (!button) return;

    button.disabled = busy;

    if (busy) {
        button.dataset.originalText = button.textContent;
        button.textContent = label || "Please wait…";
    } else {
        button.textContent =
            button.dataset.originalText || label || "Submit";
    }
}

// ==========================================
// LOGIN / REGISTRATION SCREEN
// ==========================================

function showLoginCard() {
    $("loginCard").hidden = false;
    $("signupPanel").hidden = true;
    message("signupMessage", "");
}

function showSignupCard() {
    $("loginCard").hidden = true;
    $("signupPanel").hidden = false;
    message("loginMessage", "");
}

function showSignedIn(user) {
    $("loginPanel").hidden = true;
    $("appShell").hidden = false;
    $("userArea").hidden = false;
    $("userEmail").textContent = user.email || "Signed in";
}

function showSignedOut() {
    $("loginPanel").hidden = false;
    $("appShell").hidden = true;
    $("userArea").hidden = true;

    currentUser = null;
    teamId = null;
    candidates = [];

    showLoginCard();
}

// ==========================================
// PERSONAL WORKSPACE
// ==========================================

async function loadTeam() {
    if (!currentUser) {
        throw new Error("Please sign in to continue.");
    }

    const { data, error } = await supabaseClient
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", currentUser.id)
        .limit(1);

    if (error) throw error;

    if (data?.length && data[0].team_id) {
        teamId = data[0].team_id;
        return;
    }

    const fullName =
        currentUser.user_metadata?.full_name || "My";

    const { data: workspaceId, error: workspaceError } =
        await supabaseClient.rpc("create_personal_workspace", {
            p_name: `${fullName}'s Workspace`
        });

    if (workspaceError) {
        throw new Error(
            "Workspace creation failed: " + workspaceError.message
        );
    }

    if (!workspaceId) {
        throw new Error("Workspace creation did not return an ID.");
    }

    const { data: membership, error: membershipError } =
        await supabaseClient
            .from("team_members")
            .select("team_id, role")
            .eq("user_id", currentUser.id)
            .limit(1);

    if (membershipError) throw membershipError;

    if (!membership?.length || !membership[0].team_id) {
        throw new Error(
            "Workspace was created, but membership could not be loaded. Check the team_members SELECT policy."
        );
    }

    teamId = membership[0].team_id;

    if (teamId !== workspaceId) {
        console.warn(
            "Workspace ID and membership ID differ. Check existing team memberships."
        );
    }
}

// ==========================================
// LOAD CURRENT USER'S CANDIDATES
// ==========================================

async function loadCandidates() {
    if (!currentUser || !teamId) {
        candidates = [];
        render();
        return;
    }

    const { data, error } = await supabaseClient
        .from("candidates")
        .select(
            "id, name, domain, experience, location, file_name, file_path, created_at"
        )
        .eq("team_id", teamId)
        .eq("created_by", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) throw error;

    candidates = data || [];
    render();
}

// ==========================================
// FILTER CANDIDATES
// ==========================================

function filteredCandidates() {
    const term = $("searchInput").value.trim().toLowerCase();
    const domain = $("domainFilter").value;

    return candidates.filter(c => {
        const haystack = [
            c.name,
            c.domain,
            c.experience,
            c.location
        ].join(" ").toLowerCase();

        return (!term || haystack.includes(term)) &&
            (!domain || c.domain === domain);
    });
}

// ==========================================
// DISPLAY CANDIDATES
// ==========================================

function render() {
    if (!$("candidateRows")) return;

    const rows = filteredCandidates();

    $("candidateRows").innerHTML = rows.map(c => `
        <tr>
            <td>${escapeHtml(c.name)}</td>
            <td>${escapeHtml(c.domain)}</td>
            <td>${escapeHtml(c.experience)}</td>
            <td>${escapeHtml(c.location)}</td>
            <td>
                <span class="file-name" title="${escapeHtml(c.file_name)}">
                    ${escapeHtml(c.file_name)}
                </span>
            </td>
            <td>${formatDate(c.created_at)}</td>
            <td>
                <button class="table-action"
                    data-action="view"
                    data-id="${escapeHtml(c.id)}"
                    type="button">View</button>

                <button class="table-action"
                    data-action="download"
                    data-id="${escapeHtml(c.id)}"
                    type="button">Download</button>

                <button class="table-action danger"
                    data-action="delete"
                    data-id="${escapeHtml(c.id)}"
                    type="button">Delete</button>
            </td>
        </tr>
    `).join("");

    $("emptyState").hidden = rows.length !== 0;

    $("resultCount").textContent =
        `${rows.length} ${rows.length === 1 ? "record" : "records"}`;

    $("totalCount").textContent = candidates.length;

    $("domainCount").textContent =
        new Set(candidates.map(c => c.domain)).size;

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    $("recentCount").textContent = candidates.filter(c =>
        new Date(c.created_at).getTime() >= cutoff
    ).length;

    const selected = $("domainFilter").value;

    const domains = [
        ...new Set(candidates.map(c => c.domain))
    ].sort((a, b) => a.localeCompare(b));

    $("domainFilter").innerHTML =
        '<option value="">All domains</option>' +
        domains.map(d =>
            `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`
        ).join("");

    if (domains.includes(selected)) {
        $("domainFilter").value = selected;
    }
}

// ==========================================
// REFRESH APPLICATION
// ==========================================

async function refreshApp() {
    if (!currentUser) {
        throw new Error("No authenticated user found.");
    }

    await loadTeam();
    await loadCandidates();

    showSignedIn(currentUser);
}

// ==========================================
// LOGIN
// ==========================================

async function login(event) {
    event.preventDefault();

    if (!configured || !supabaseClient) {
        message("loginMessage", "Supabase is not configured.", "error");
        return;
    }

    const btn = $("loginBtn");
    setBusy(btn, true, "Signing in…");
    message("loginMessage", "");

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email: $("loginEmail").value.trim(),
                password: $("loginPassword").value
            });

        if (error) throw error;

        currentUser = data.user;

        await refreshApp();

        message("loginMessage", "");

    } catch (error) {
        console.error("Login error:", error);
        showSignedOut();

        message(
            "loginMessage",
            error.message || "Unable to sign in.",
            "error"
        );

    } finally {
        setBusy(btn, false);
    }
}

// ==========================================
// NEW USER REGISTRATION
// ==========================================

async function registerUser(event) {
    event.preventDefault();

    if (!configured || !supabaseClient) {
        message("signupMessage", "Supabase is not configured.", "error");
        return;
    }

    const fullName = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    const confirmPassword = $("signupConfirmPassword").value;

    const btn = $("signupBtn");

    message("signupMessage", "");

    if (!fullName) {
        message("signupMessage", "Please enter your full name.", "error");
        return;
    }

    if (password.length < 8) {
        message("signupMessage", "Password must contain at least 8 characters.", "error");
        return;
    }

    if (password !== confirmPassword) {
        message("signupMessage", "Passwords do not match.", "error");
        return;
    }

    setBusy(btn, true, "Creating account…");

    try {
        const { data, error } =
            await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName
                    }
                }
            });

        if (error) throw error;

        if (!data.user) {
            throw new Error("Account creation was unsuccessful.");
        }

        if (!data.session) {
            message(
                "signupMessage",
                "Account created. Please verify your email and then sign in.",
                "error"
            );
            return;
        }

        // IMPORTANT: Verify the authenticated user before the RPC.
        const {
            data: authCheck,
            error: authCheckError
        } = await supabaseClient.auth.getUser();

        if (authCheckError) throw authCheckError;

        console.log("Registration user ID:", data.user.id);
        console.log("Authenticated user ID:", authCheck?.user?.id);

        if (!authCheck?.user?.id) {
            throw new Error(
                "No authenticated session found. Please sign in again."
            );
        }

        if (data.user.id !== authCheck.user.id) {
            throw new Error(
                "The newly registered account does not match the active login. Please sign out and register again."
            );
        }

        currentUser = authCheck.user;

        // Create this recruiter's workspace.
        const { data: workspaceId, error: workspaceError } =
            await supabaseClient.rpc(
                "create_personal_workspace",
                {
                    p_name: `${fullName}'s Workspace`
                }
            );

        if (workspaceError) {
            throw new Error(
                "Workspace creation failed: " + workspaceError.message
            );
        }

        if (!workspaceId) {
            throw new Error("Personal workspace was not created.");
        }

        await refreshApp();

        $("signupForm").reset();

        message(
            "signupMessage",
            "Account and personal workspace created successfully!",
            "success"
        );

    } catch (error) {
        console.error("Registration error:", error);

        message(
            "signupMessage",
            error.message || "Unable to create account.",
            "error"
        );

    } finally {
        setBusy(btn, false);
    }
}

// ==========================================
// ADD CANDIDATE
// ==========================================

async function addCandidate(event) {
    event.preventDefault();

    if (!currentUser || !teamId) {
        return message("formMessage", "Please sign in first.", "error");
    }

    const btn = $("saveBtn");
    const file = $("resumeFile").files[0];

    if (!file) {
        return message("formMessage", "Please choose a resume file.", "error");
    }

    const ext = fileExtension(file.name);

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return message("formMessage", "Only PDF, DOC and DOCX files are allowed.", "error");
    }

    if (file.size > MAX_FILE_SIZE) {
        return message("formMessage", "File is larger than 15 MB.", "error");
    }

    setBusy(btn, true, "Uploading…");
    message("formMessage", "Uploading resume and saving candidate…");

    let uploadedPath = null;

    try {
        const path =
            `${teamId}/${currentUser.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

        const { error: uploadError } =
            await supabaseClient.storage
                .from(BUCKET)
                .upload(path, file, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type || undefined
                });

        if (uploadError) throw uploadError;

        uploadedPath = path;

        const payload = {
            team_id: teamId,
            name: $("personName").value.trim(),
            domain: $("domain").value.trim(),
            experience: $("experience").value.trim(),
            location: $("location").value.trim(),
            file_name: file.name,
            file_path: path,
            created_by: currentUser.id
        };

        const { error: insertError } =
            await supabaseClient
                .from("candidates")
                .insert(payload);

        if (insertError) throw insertError;

        $("candidateForm").reset();

        message("formMessage", "Candidate saved successfully.", "success");

        await loadCandidates();

    } catch (error) {
        if (uploadedPath) {
            const { error: cleanupError } =
                await supabaseClient.storage
                    .from(BUCKET)
                    .remove([uploadedPath]);

            if (cleanupError) {
                console.error("File cleanup error:", cleanupError);
            }
        }

        message(
            "formMessage",
            error.message || "Could not save candidate.",
            "error"
        );

    } finally {
        setBusy(btn, false);
    }
}

// ==========================================
// DOWNLOAD RESUME
// ==========================================

async function downloadResume(candidate) {
    const { data, error } =
        await supabaseClient.storage
            .from(BUCKET)
            .download(candidate.file_path);

    if (error) throw error;

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");

    a.href = url;
    a.download = candidate.file_name;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ==========================================
// PREVIEW RESUME
// ==========================================

async function previewResume(candidate) {
    $("previewTitle").textContent =
        `Resume preview — ${candidate.name}`;

    $("previewContent").innerHTML =
        '<p class="preview-note">Preparing secure preview…</p>';

    $("previewModal").hidden = false;

    if (fileExtension(candidate.file_name) !== "pdf") {
        $("previewContent").innerHTML =
            '<p class="preview-note">Preview is available for PDF files. Download DOC or DOCX resumes.</p>';
        return;
    }

    const { data, error } =
        await supabaseClient.storage
            .from(BUCKET)
            .createSignedUrl(candidate.file_path, 120);

    if (error) {
        $("previewContent").innerHTML =
            `<p class="preview-note">${escapeHtml(error.message)}</p>`;
        return;
    }

    const frame = document.createElement("iframe");
    frame.title = `Resume for ${candidate.name}`;
    frame.src = data.signedUrl;

    $("previewContent").replaceChildren(frame);
}

// ==========================================
// DELETE CANDIDATE
// ==========================================

async function deleteCandidate(candidate) {
    if (!confirm(
        `Delete ${candidate.name} and their resume? This cannot be undone.`
    )) {
        return;
    }

    try {
        const { error: fileError } =
            await supabaseClient.storage
                .from(BUCKET)
                .remove([candidate.file_path]);

        if (fileError) throw fileError;

        const { error: rowError } =
            await supabaseClient
                .from("candidates")
                .delete()
                .eq("id", candidate.id)
                .eq("team_id", teamId)
                .eq("created_by", currentUser.id);

        if (rowError) throw rowError;

        await loadCandidates();

    } catch (error) {
        alert(error.message || "Unable to delete candidate.");
    }
}

// ==========================================
// TABLE ACTIONS
// ==========================================

async function handleTableAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const candidate = candidates.find(
        c => String(c.id) === button.dataset.id
    );

    if (!candidate) return;

    try {
        if (button.dataset.action === "view") {
            await previewResume(candidate);
        } else if (button.dataset.action === "download") {
            await downloadResume(candidate);
        } else if (button.dataset.action === "delete") {
            await deleteCandidate(candidate);
        }

    } catch (error) {
        alert(error.message || "Action failed.");
    }
}

// ==========================================
// CSV EXPORT
// ==========================================

function csvCell(value) {
    let s = String(value ?? "");

    if (/^[\s]*[=+\-@]/.test(s)) {
        s = "'" + s;
    }

    return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv() {
    const rows = filteredCandidates();

    const headers = [
        "Name", "Domain", "Experience",
        "Location", "Resume", "Added"
    ];

    const lines = [
        headers,
        ...rows.map(c => [
            c.name,
            c.domain,
            c.experience,
            c.location,
            c.file_name,
            c.created_at
        ])
    ].map(row => row.map(csvCell).join(",")).join("\r\n");

    const blob = new Blob(
        ["\uFEFF" + lines],
        { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "resume-vault-candidates.csv";
    a.click();

    URL.revokeObjectURL(url);
}

// ==========================================
// LOGOUT
// ==========================================

async function logout() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        alert(error.message);
        return;
    }

    showSignedOut();
}

// ==========================================
// CLOSE PREVIEW
// ==========================================

function closePreview() {
    $("previewModal").hidden = true;
    $("previewContent").replaceChildren();
}

// ==========================================
// INITIALIZE APPLICATION
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    if (!configured || !window.supabase?.createClient) {
        $("setupNotice").hidden = false;
        $("loginBtn").disabled = true;
        $("signupBtn").disabled = true;
        return;
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    $("loginForm").addEventListener("submit", login);
    $("signupForm").addEventListener("submit", registerUser);

    $("showSignupBtn").addEventListener("click", showSignupCard);
    $("showLoginBtn").addEventListener("click", showLoginCard);

    $("candidateForm").addEventListener("submit", addCandidate);
    $("searchInput").addEventListener("input", render);
    $("domainFilter").addEventListener("change", render);

    $("candidateRows").addEventListener("click", handleTableAction);
    $("exportBtn").addEventListener("click", exportCsv);
    $("logoutBtn").addEventListener("click", logout);

    $("closePreview").addEventListener("click", closePreview);

    $("previewModal").addEventListener("click", e => {
        if (e.target.hasAttribute("data-close-preview")) {
            closePreview();
        }
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") closePreview();
    });

    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error) {
        message("loginMessage", error.message, "error");
    }

    if (session) {
        currentUser = session.user;

        try {
            await refreshApp();
        } catch (error) {
            console.error("Session restoration error:", error);

            showSignedOut();

            message(
                "loginMessage",
                error.message || "Could not load your workspace.",
                "error"
            );
        }
    } else {
        showSignedOut();
    }

    supabaseClient.auth.onAuthStateChange((event, sessionNow) => {
        if (event === "SIGNED_OUT" || !sessionNow) {
            showSignedOut();
        }
    });
});
