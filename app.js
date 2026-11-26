
/*
 * ResumeVault - Supabase-connected frontend
 * Individual recruiter data isolation.
 * Uses Supabase Publishable Key.
 * NEVER put a service_role / secret key in this file.
 */

const SUPABASE_URL = "https://qejdevxzxdakstsxwscq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2oF5fMOnLCW0j55nMiIfVQ_WK6ZBIrZ";

const BUCKET = "candidate-resumes";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx"];

const $ = (id) => document.getElementById(id);

const configured =
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_");

let supabaseClient = null;
let currentUser = null;
let teamId = null;
let candidates = [];

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
}

/* LOAD TEAM MEMBERSHIP */
async function loadTeam() {
    const { data, error } = await supabaseClient
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", currentUser.id)
        .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
        throw new Error(
            "Your account is not assigned to a team yet. Ask your administrator to add your user to team_members."
        );
    }

    teamId = data[0].team_id;
}

/* LOAD ONLY CURRENT RECRUITER'S CANDIDATES */
async function loadCandidates() {
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

/* FILTER CANDIDATES */
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

/* DISPLAY CANDIDATES */
function render() {
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

/* REFRESH APPLICATION */
async function refreshApp() {
    await loadTeam();

    showSignedIn(currentUser);

    await loadCandidates();
}

/* LOGIN */
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
        message(
            "loginMessage",
            error.message || "Unable to sign in.",
            "error"
        );

        if (currentUser && !teamId) {
            showSignedOut();
        }

    } finally {
        setBusy(btn, false);
    }
}

/* ADD CANDIDATE - PRIVATE RECRUITER FOLDER */
async function addCandidate(event) {
    event.preventDefault();

    if (!currentUser || !teamId) {
        return message(
            "formMessage",
            "Please sign in before adding a candidate.",
            "error"
        );
    }

    const btn = $("saveBtn");
    const file = $("resumeFile").files[0];

    if (!file) {
        return message(
            "formMessage",
            "Please choose a resume file.",
            "error"
        );
    }

    const ext = fileExtension(file.name);

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return message(
            "formMessage",
            "Only PDF, DOC and DOCX files are allowed.",
            "error"
        );
    }

    if (file.size > MAX_FILE_SIZE) {
        return message(
            "formMessage",
            "File is larger than 15 MB.",
            "error"
        );
    }

    setBusy(btn, true, "Uploading…");

    message(
        "formMessage",
        "Uploading resume and saving candidate…"
    );

    let uploadedPath = null;

    try {
        // Each recruiter gets a separate Storage folder.
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

        message(
            "formMessage",
            "Candidate saved successfully.",
            "success"
        );

        await loadCandidates();

    } catch (error) {
        if (uploadedPath) {
            await supabaseClient.storage
                .from(BUCKET)
                .remove([uploadedPath]);
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

/* DOWNLOAD RESUME */
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

/* PREVIEW RESUME */
async function previewResume(candidate) {
    $("previewTitle").textContent =
        `Resume preview — ${candidate.name}`;

    $("previewContent").innerHTML =
        '<p class="preview-note">Preparing secure preview…</p>';

    $("previewModal").hidden = false;

    if (fileExtension(candidate.file_name) !== "pdf") {
        $("previewContent").innerHTML =
            '<p class="preview-note">In-browser preview is available for PDF files. Use the Download button for DOC or DOCX resumes.</p>';

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

/* DELETE CANDIDATE */
async function deleteCandidate(candidate) {
    if (!confirm(
        `Delete ${candidate.name} and their resume? This cannot be undone.`
    )) {
        return;
    }

    try {
        // Database RLS also restricts deletion to the current user.
        const { error: rowError } =
            await supabaseClient
                .from("candidates")
                .delete()
                .eq("id", candidate.id)
                .eq("team_id", teamId)
                .eq("created_by", currentUser.id);

        if (rowError) throw rowError;

        const { error: fileError } =
            await supabaseClient.storage
                .from(BUCKET)
                .remove([candidate.file_path]);

        if (fileError) {
            alert(
                `Candidate record deleted, but the resume file could not be removed: ${fileError.message}`
            );
        }

        await loadCandidates();

    } catch (error) {
        alert(error.message || "Unable to delete candidate.");
    }
}

/* TABLE ACTIONS */
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
        }

        if (button.dataset.action === "download") {
            await downloadResume(candidate);
        }

        if (button.dataset.action === "delete") {
            await deleteCandidate(candidate);
        }

    } catch (error) {
        alert(error.message || "Action failed.");
    }
}

/* CSV EXPORT */
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
        "Name",
        "Domain",
        "Experience",
        "Location",
        "Resume",
        "Added"
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
    ]
        .map(row => row.map(csvCell).join(","))
        .join("\r\n");

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

/* LOGOUT */
async function logout() {
    await supabaseClient.auth.signOut();
    showSignedOut();
}

/* CLOSE PREVIEW */
function closePreview() {
    $("previewModal").hidden = true;
    $("previewContent").replaceChildren();
}

/* INITIALIZE APPLICATION */
document.addEventListener("DOMContentLoaded", async () => {

    if (!configured || !window.supabase?.createClient) {
        $("setupNotice").hidden = false;
        $("loginBtn").disabled = true;
        return;
    }

    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );

    $("loginForm").addEventListener("submit", login);

    $("candidateForm").addEventListener("submit", addCandidate);

    $("searchInput").addEventListener("input", render);

    $("domainFilter").addEventListener("change", render);

    $("candidateRows").addEventListener(
        "click",
        handleTableAction
    );

    $("exportBtn").addEventListener("click", exportCsv);

    $("logoutBtn").addEventListener("click", logout);

    $("closePreview").addEventListener(
        "click",
        closePreview
    );

    $("previewModal").addEventListener("click", e => {
        if (e.target.hasAttribute("data-close-preview")) {
            closePreview();
        }
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            closePreview();
        }
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
            showSignedOut();

            message(
                "loginMessage",
                error.message || "Could not load your team.",
                "error"
            );
        }
    }

    supabaseClient.auth.onAuthStateChange(
        (event, sessionNow) => {
            if (event === "SIGNED_OUT" || !sessionNow) {
                showSignedOut();
            }
        }
    );
});
