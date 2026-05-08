import { useState, useRef, useEffect, useCallback } from "react";

const MODEL = "claude-sonnet-4-6";
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";

// Character limits: ~30-min meeting = ~4,500 chars. 60-min = ~9,000.
const STANDARD_LIMIT = 4500;  // included in base plan
const PRO_LIMIT = 9000;       // extended — would require upgrade
const HARD_LIMIT = PRO_LIMIT; // absolute cap in this demo

const SAMPLE = `Meeting with Sonia Rodriguez — independent R&B artist releasing debut EP "He's Alive."

The song is spiritual R&B about her late grandfather. She wants the video to feel like a beautiful memory — cinematic home video aesthetic. Loves Beyoncé Lemonade and Childish Gambino Redbone. Warm, golden, film-grain.

Locations: grandmother's house in Houston, old Baptist church nearby, open field at golden hour.

Wardrobe: Sonia in white flowy dress. 3 dancers in earth tones — terracotta, dusty sage. Wants it personal, not polished. "I want people to cry."

Key shots: performance at church, her at grandfather's old piano, slow mo laughing and crying, his old Bible with a 1987 receipt inside.

We also discussed a behind-the-scenes EPK mini documentary — 5-7 minutes — capturing the making of the video, interviews about the song's meaning, candid family moments.

Deliverables: 4-minute music video, 60-second Instagram reel, 5-7 minute EPK documentary, 8-10 production stills.
Budget: $6,500. Timeline: 3 weeks shoot, 2 weeks post.`;

const SYSTEM_PROMPT = `You are a creative director AI for a video and photography production company. Analyze meeting notes and return ONLY a valid JSON object — no markdown, no backticks, no explanation, just raw JSON.

Create one concept per deliverable. Generate 3-5 clientActionItems (things the client must do before shoot) and 3-5 internalTodos (internal team tasks).

Return exactly this structure:
{"coverEmoji":"🎬","projectTitle":"","clientName":"","projectType":"","date":"","timeline":"","budget":"","logline":"","overview":"","moodKeywords":[],"moodDescription":"","references":[],"overallLocations":[{"name":"","description":""}],"overallWardrobe":[],"overallProps":[],"generalNotes":"","clientActionItems":[{"id":"ca-1","text":"","done":false}],"internalTodos":[{"id":"it-1","text":"","done":false}],"concepts":[{"id":"concept-1","emoji":"🎥","title":"","type":"","logline":"","description":"","moodKeywords":[],"inspiration":[],"locations":[{"name":"","vibe":"","description":"","shots":""}],"lighting":{"style":"","description":"","technical":""},"colorHex":["#c8a97e","#3d2b1f","#f5ede0"],"colorDescription":"","wardrobe":[],"wardrobeNotes":"","props":[],"shotList":[{"number":"01","type":"","description":"","lens":"","notes":""}],"script":{"hook":"","act1":"","act2":"","act3":"","cta":""},"deliverableFormat":"","directorNotes":""}]}`;

// ─── Storage ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "framebrief_projects_v3";
function loadProjects() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveProjects(p) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {} }

// ─── File helpers ─────────────────────────────────────────────────────────────
function readFileAsText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error("Failed to read")); r.readAsText(file); }); }
function readFileAsBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result.split(",")[1]); r.onerror = () => rej(new Error("Failed to read")); r.readAsDataURL(file); }); }
const ACCEPTED_TYPES = { "application/pdf": "pdf", "text/plain": "txt", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "text/markdown": "md" };

// ─── URL detection ─────────────────────────────────────────────────────────────
function isURL(str) { try { const u = new URL(str); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } }

function LinkableText({ text }) {
  // Split text into URL and non-URL parts
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <span>
      {parts.map((part, i) =>
        urlRegex.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#1a56c4", textDecoration: "underline", wordBreak: "break-all" }} onClick={e => e.stopPropagation()}>{part}</a>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Editable({ value, onChange, multiline = false, placeholder = "Click to edit…", style = {} }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const ref = useRef();
  useEffect(() => setVal(value ?? ""), [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const commit = () => { setEditing(false); if (val !== (value ?? "")) onChange(val); };
  const shared = { fontFamily: "inherit", fontSize: "inherit", color: "inherit", lineHeight: "inherit", width: "100%", border: "none", outline: "none", background: "rgba(35,131,226,0.07)", borderRadius: 4, padding: "3px 6px" };
  if (editing) return multiline
    ? <textarea ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} style={{ ...shared, resize: "vertical", minHeight: 52 }} />
    : <input ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()} style={shared} />;
  return (
    <span onClick={() => setEditing(true)} style={{ cursor: "text", display: "block", borderRadius: 4, padding: "3px 6px", minHeight: "1.4em", wordBreak: "break-word", transition: "background .12s", ...style }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(55,53,47,0.06)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {val ? <LinkableText text={val} /> : <span style={{ color: "#c4c3bf", fontStyle: "italic" }}>{placeholder}</span>}
    </span>
  );
}

// ─── Tag with link support ────────────────────────────────────────────────────
function Tag({ value, bg, color, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef();
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const url = isURL(value);
  if (editing) return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onBlur={() => { setEditing(false); onEdit(val); }}
      onKeyDown={e => e.key === "Enter" && ref.current.blur()}
      style={{ border: "1px solid #2383e2", borderRadius: 20, padding: "3px 12px", fontSize: 12, outline: "none", width: Math.max(64, val.length * 9), fontFamily: "inherit", background: "#fff" }} />
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: bg, color, borderRadius: 20, padding: "3px 12px 3px 10px", fontSize: 12, fontWeight: 500, userSelect: "none", margin: "2px 3px" }}>
      {url
        ? <a href={value} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color, textDecoration: "underline", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>{value.replace(/^https?:\/\//, "").split("/")[0]}</a>
        : <span onClick={() => setEditing(true)} style={{ cursor: "text" }}>{value}</span>
      }
      {!url && <span onClick={() => setEditing(true)} style={{ cursor: "text", fontSize: 9, opacity: 0.4 }}> ✏</span>}
      <span onClick={onDelete} style={{ cursor: "pointer", opacity: 0.45, fontSize: 9, marginLeft: 2 }}>✕</span>
    </span>
  );
}

// ─── To-do list ───────────────────────────────────────────────────────────────
function TodoList({ items, onUpdate, onAdd, onDelete, label, accentColor = "#37352f", readonly = false }) {
  const [newText, setNewText] = useState("");
  const inputRef = useRef();

  function addItem() {
    if (!newText.trim()) return;
    onAdd({ id: `todo-${Date.now()}`, text: newText.trim(), done: false });
    setNewText("");
    inputRef.current?.focus();
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {(items || []).map((item, i) => (
          <div key={item.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0", group: true }}>
            <input type="checkbox" checked={item.done} onChange={e => onUpdate(i, { ...item, done: e.target.checked })}
              disabled={readonly}
              style={{ marginTop: 3, accentColor, cursor: readonly ? "default" : "pointer", flexShrink: 0, width: 15, height: 15 }} />
            <div style={{ flex: 1, fontSize: 14, color: item.done ? "#9b9a97" : "#37352f", textDecoration: item.done ? "line-through" : "none", lineHeight: 1.6 }}>
              {readonly
                ? <span>{item.text}</span>
                : <Editable value={item.text} onChange={v => onUpdate(i, { ...item, text: v })} placeholder="Add item…" />
              }
            </div>
            {!readonly && (
              <button onClick={() => onDelete(i)} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 13, padding: "0 2px", opacity: 0, transition: "opacity .15s", lineHeight: 1 }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}>✕</button>
            )}
          </div>
        ))}
      </div>
      {!readonly && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addItem()}
            placeholder="Add item… (press Enter)"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: "#37352f", fontFamily: "inherit", padding: "4px 6px", borderRadius: 4, background: "transparent" }}
            onFocus={e => e.target.style.background = "rgba(35,131,226,0.06)"}
            onBlur={e => { e.target.style.background = "transparent"; }} />
          {newText.trim() && (
            <button onClick={addItem} style={{ background: "#37352f", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Add</button>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ emoji, title, children, defaultOpen = true, badge = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 2 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", padding: "9px 6px", cursor: "pointer", borderRadius: 6, fontFamily: "inherit", textAlign: "left" }}
        onMouseEnter={e => e.currentTarget.style.background = "#f7f6f3"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <span style={{ fontSize: 11, color: "#c4c3bf", display: "inline-block", transition: "transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <span style={{ fontSize: 15 }}>{emoji}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#37352f", letterSpacing: "-0.01em" }}>{title}</span>
        {badge && <span style={{ fontSize: 11, background: badge.bg, color: badge.color, borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>{badge.label}</span>}
      </button>
      {open && <div style={{ paddingLeft: 28, paddingBottom: 10 }}>{children}</div>}
    </div>
  );
}

const HR = () => <div style={{ height: 1, background: "#f1f0ef", margin: "14px 0" }} />;

function PropRow({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", padding: "7px 16px", borderBottom: "1px solid #f1f0ef", gap: 12 }}>
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#9b9a97", minWidth: 126, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 14, color: "#37352f" }}>{children}</span>
    </div>
  );
}

function AddBtn({ label, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", padding: "4px 0", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}
      onMouseEnter={e => e.currentTarget.style.color = "#37352f"}
      onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>
      + {label}
    </button>
  );
}

// ─── Status ───────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ["Draft", "In Progress", "Review", "Delivered", "Archived"];
const STATUS_COLORS = { "Draft": { bg: "#f1f0ef", color: "#9b9a97" }, "In Progress": { bg: "#e8f0fe", color: "#1a56c4" }, "Review": { bg: "#fdeee4", color: "#b94a1a" }, "Delivered": { bg: "#e6f4ea", color: "#1e7e34" }, "Archived": { bg: "#f1f0ef", color: "#c4c3bf" } };

function StatusBadge({ status, onChange, readonly = false }) {
  const [open, setOpen] = useState(false);
  const c = STATUS_COLORS[status] || STATUS_COLORS["Draft"];
  if (readonly) return <span style={{ background: c.bg, color: c.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{status}</span>;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <span onClick={() => setOpen(o => !o)} style={{ background: c.bg, color: c.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", userSelect: "none" }}>{status} ▾</span>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", border: "1px solid #f1f0ef", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 200, minWidth: 140, overflow: "hidden" }}>
          {STATUS_OPTIONS.map(s => { const sc = STATUS_COLORS[s]; return (
            <div key={s} onClick={() => { onChange(s); setOpen(false); }} style={{ padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = "#f7f6f3"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{s}</span>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

// ─── Doc Upload ───────────────────────────────────────────────────────────────
function DocUpload({ docs, onAdd, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef();

  async function handleFiles(files) {
    setProcessing(true);
    const results = [];
    for (const file of Array.from(files)) {
      const type = ACCEPTED_TYPES[file.type];
      if (!type) { results.push({ error: `${file.name} — unsupported type` }); continue; }
      if (file.size > 10 * 1024 * 1024) { results.push({ error: `${file.name} — too large (max 10MB)` }); continue; }
      try {
        if (type === "pdf") { const base64 = await readFileAsBase64(file); results.push({ name: file.name, type: "pdf", base64, size: file.size }); }
        else { const text = await readFileAsText(file); results.push({ name: file.name, type: "text", content: text, size: file.size }); }
      } catch { results.push({ error: `${file.name} — could not read` }); }
    }
    setProcessing(false);
    onAdd(results);
  }

  const fmt = b => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;

  return (
    <div>
      <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Client Documents <span style={{ color: "#c4c3bf", fontSize: 10 }}>(optional)</span></div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? "#37352f" : "#e8e4dc"}`, borderRadius: 10, padding: "22px 20px", textAlign: "center", cursor: "pointer", background: dragging ? "#f7f6f3" : "#fafaf9", transition: "all .15s", marginBottom: docs.length > 0 ? 12 : 0 }}>
        <input ref={inputRef} type="file" multiple accept=".pdf,.txt,.doc,.docx,.md" onChange={e => handleFiles(e.target.files)} style={{ display: "none" }} />
        {processing
          ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><div className="spin" style={{ width: 16, height: 16, border: "2px solid #e8e4dc", borderTop: "2px solid #37352f", borderRadius: "50%" }} /><span style={{ fontSize: 13, color: "#9b9a97" }}>Reading…</span></div>
          : <><div style={{ fontSize: 22, marginBottom: 6 }}>📎</div><p style={{ fontSize: 14, color: "#37352f", fontWeight: 500, marginBottom: 3 }}>Drop files or click to browse</p><p style={{ fontSize: 12, color: "#9b9a97" }}>PDF, Word, TXT · Max 10MB</p></>
        }
      </div>
      {docs.filter(d => !d.error).map((doc, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#f7f6f3", borderRadius: 8, marginBottom: 6, border: "1px solid #eeece8" }}>
          <span style={{ fontSize: 16 }}>{doc.type === "pdf" ? "📄" : "📝"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
            <div style={{ fontSize: 11, color: "#9b9a97" }}>{doc.type === "pdf" ? "PDF" : "Text"} · {fmt(doc.size)}</div>
          </div>
          <span style={{ fontSize: 11, background: "#e6f4ea", color: "#1e7e34", borderRadius: 20, padding: "2px 8px", fontWeight: 600, flexShrink: 0 }}>✓</span>
          <button onClick={() => onRemove(i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ccc"}>✕</button>
        </div>
      ))}
      {docs.filter(d => d.error).map((d, i) => <div key={`e${i}`} style={{ fontSize: 12, color: "#c0392b", padding: "4px 0" }}>⚠ {d.error}</div>)}
    </div>
  );
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
function OverviewPage({ brief, setBrief, goTo, readonly = false }) {
  const set = (k, v) => setBrief(b => ({ ...b, [k]: v }));
  const upArr = (k, i, v) => setBrief(b => { const a = [...(b[k] || [])]; a[i] = v; return { ...b, [k]: a }; });
  const delArr = (k, i) => setBrief(b => ({ ...b, [k]: (b[k] || []).filter((_, j) => j !== i) }));
  const addArr = (k, item) => setBrief(b => ({ ...b, [k]: [...(b[k] || []), item] }));

  const clientTodos = brief.clientActionItems || [];
  const internalTodos = brief.internalTodos || [];
  const clientDone = clientTodos.filter(t => t.done).length;
  const internalDone = internalTodos.filter(t => t.done).length;

  return (
    <div style={{ maxWidth: 760, padding: "60px 76px 120px" }}>
      <div style={{ fontSize: 54, marginBottom: 12 }}>{brief.coverEmoji || "🎬"}</div>
      {readonly
        ? <h1 style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 8px", color: "#37352f", lineHeight: 1.15 }}>{brief.projectTitle}</h1>
        : <h1 contentEditable suppressContentEditableWarning onBlur={e => set("projectTitle", e.target.innerText)} style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 8px", outline: "none", color: "#37352f", lineHeight: 1.15 }}>{brief.projectTitle}</h1>
      }
      <div style={{ fontSize: 16, color: "#9b9a97", fontStyle: "italic", marginBottom: 20, lineHeight: 1.6 }}>
        {readonly ? <p style={{ margin: 0 }}>{brief.logline}</p> : <Editable value={brief.logline} onChange={v => set("logline", v)} placeholder="Project logline…" />}
      </div>
      <div style={{ border: "1px solid #f1f0ef", borderRadius: 10, overflow: "hidden", marginBottom: 32 }}>
        {[["Client", "clientName"], ["Project Type", "projectType"], ["Date", "date"], ["Timeline", "timeline"], ["Budget", "budget"]].map(([l, k]) => (
          <PropRow key={k} label={l}>{readonly ? brief[k] : <Editable value={brief[k]} onChange={v => set(k, v)} />}</PropRow>
        ))}
      </div>

      {/* Concepts index */}
      {!readonly && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Concepts</div>
          {(brief.concepts || []).map((c, i) => (
            <div key={i} onClick={() => goTo && goTo(`concept-${i}`)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", border: "1px solid #f1f0ef", borderRadius: 8, background: "#fafaf9", marginBottom: 6, cursor: goTo ? "pointer" : "default", transition: "background .12s" }}
              onMouseEnter={e => goTo && (e.currentTarget.style.background = "#f0ede8")}
              onMouseLeave={e => e.currentTarget.style.background = "#fafaf9"}>
              <span style={{ fontSize: 22 }}>{c.emoji || "🎬"}</span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14, color: "#37352f" }}>{c.title}</div><div style={{ fontSize: 12, color: "#9b9a97" }}>{c.type}{c.deliverableFormat ? ` · ${c.deliverableFormat}` : ""}</div></div>
              {goTo && <span style={{ fontSize: 11, background: "#eeece8", borderRadius: 20, padding: "3px 10px", color: "#9b9a97", whiteSpace: "nowrap" }}>Open →</span>}
            </div>
          ))}
        </div>
      )}

      <HR />

      {/* Client Action Items */}
      <Section emoji="✅" title="Client Action Items" badge={clientTodos.length > 0 ? { label: `${clientDone}/${clientTodos.length}`, bg: "#e6f4ea", color: "#1e7e34" } : null}>
        <p style={{ fontSize: 12, color: "#9b9a97", marginBottom: 12, fontStyle: "italic" }}>Items your client needs to complete before the shoot.</p>
        <TodoList
          items={clientTodos}
          onUpdate={(i, v) => upArr("clientActionItems", i, v)}
          onAdd={item => addArr("clientActionItems", item)}
          onDelete={i => delArr("clientActionItems", i)}
          label="Client action items"
          accentColor="#1e7e34"
          readonly={readonly}
        />
      </Section>
      <HR />

      {/* Internal Todos — hidden in client view */}
      {!readonly && (
        <>
          <Section emoji="🔒" title="Internal Team To-Do" badge={internalTodos.length > 0 ? { label: `${internalDone}/${internalTodos.length}`, bg: "#fdeee4", color: "#b94a1a" } : null}>
            <div style={{ background: "#fffbf7", border: "1px solid #fdeee4", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: "#b94a1a", margin: 0 }}>🔒 Internal only — not visible in Client View</p>
            </div>
            <TodoList
              items={internalTodos}
              onUpdate={(i, v) => upArr("internalTodos", i, v)}
              onAdd={item => addArr("internalTodos", item)}
              onDelete={i => delArr("internalTodos", i)}
              label="Internal to-do"
              accentColor="#e97942"
              readonly={false}
            />
          </Section>
          <HR />
        </>
      )}

      <Section emoji="📋" title="Project Overview">
        <div style={{ fontSize: 15, lineHeight: 1.95 }}>
          {readonly ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{brief.overview}</p> : <Editable value={brief.overview} onChange={v => set("overview", v)} multiline placeholder="Project overview…" />}
        </div>
      </Section>
      <HR />

      <Section emoji="🎭" title="Mood & Tone">
        <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 12 }}>
          {(brief.moodKeywords || []).map((k, i) => readonly
            ? <span key={i} style={{ background: "#fdeee4", color: "#b94a1a", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 500, margin: "2px 3px" }}>{k}</span>
            : <Tag key={i} value={k} bg="#fdeee4" color="#b94a1a" onEdit={v => upArr("moodKeywords", i, v)} onDelete={() => delArr("moodKeywords", i)} />
          )}
          {!readonly && <AddBtn label="Add" onClick={() => addArr("moodKeywords", "new")} />}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.85, color: "#55534e", marginBottom: 14 }}>
          {readonly ? <p style={{ margin: 0 }}>{brief.moodDescription}</p> : <Editable value={brief.moodDescription} onChange={v => set("moodDescription", v)} multiline placeholder="Overall mood…" />}
        </div>
        <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>References & Links</div>
        <p style={{ fontSize: 12, color: "#c4c3bf", marginBottom: 8, fontStyle: "italic" }}>Paste a URL to make it clickable, or type a reference name.</p>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {(brief.references || []).map((r, i) => readonly
            ? (isURL(r)
                ? <a key={i} href={r} target="_blank" rel="noopener noreferrer" style={{ background: "#e8f0fe", color: "#1a56c4", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 500, margin: "2px 3px", textDecoration: "none", display: "inline-block", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.replace(/^https?:\/\//, "").split("/")[0]}</a>
                : <span key={i} style={{ background: "#e8f0fe", color: "#1a56c4", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 500, margin: "2px 3px" }}>{r}</span>
              )
            : <Tag key={i} value={r} bg="#e8f0fe" color="#1a56c4" onEdit={v => upArr("references", i, v)} onDelete={() => delArr("references", i)} />
          )}
          {!readonly && <AddBtn label="Add reference or paste link" onClick={() => addArr("references", "https://")} />}
        </div>
      </Section>
      <HR />

      <Section emoji="📍" title="Overall Locations">
        {(brief.overallLocations || []).map((loc, i) => (
          <div key={i} style={{ padding: "12px 14px", background: "#f7f6f3", borderRadius: 8, marginBottom: 8, border: "1px solid #eeece8" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{readonly ? loc.name : <Editable value={loc.name} onChange={v => upArr("overallLocations", i, { ...loc, name: v })} placeholder="Location name" />}</div>
                <div style={{ fontSize: 13, color: "#55534e", lineHeight: 1.7 }}>{readonly ? <p style={{ margin: 0 }}>{loc.description}</p> : <Editable value={loc.description} onChange={v => upArr("overallLocations", i, { ...loc, description: v })} multiline placeholder="Describe…" />}</div>
              </div>
              {!readonly && <button onClick={() => delArr("overallLocations", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, marginLeft: 8 }}>✕</button>}
            </div>
          </div>
        ))}
        {!readonly && <AddBtn label="Add location" onClick={() => addArr("overallLocations", { name: "New Location", description: "" })} />}
      </Section>
      <HR />

      <Section emoji="👗" title="Overall Wardrobe">
        {(brief.overallWardrobe || []).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ color: "#e97942" }}>→</span>
            <div style={{ flex: 1, fontSize: 14 }}>{readonly ? item : <Editable value={item} onChange={v => upArr("overallWardrobe", i, v)} />}</div>
            {!readonly && <button onClick={() => delArr("overallWardrobe", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 11 }}>✕</button>}
          </div>
        ))}
        {!readonly && <AddBtn label="Add item" onClick={() => addArr("overallWardrobe", "New item")} />}
      </Section>
      <HR />

      <Section emoji="🎪" title="Overall Props">
        {(brief.overallProps || []).map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ color: "#9b9a97" }}>·</span>
            <div style={{ flex: 1, fontSize: 14 }}>{readonly ? p : <Editable value={p} onChange={v => upArr("overallProps", i, v)} />}</div>
            {!readonly && <button onClick={() => delArr("overallProps", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 11 }}>✕</button>}
          </div>
        ))}
        {!readonly && <AddBtn label="Add prop" onClick={() => addArr("overallProps", "New prop")} />}
      </Section>
      <HR />

      <Section emoji="📝" title="General Notes">
        <div style={{ fontSize: 14, lineHeight: 1.85, color: "#55534e", borderLeft: "3px solid #e8e4dc", paddingLeft: 16 }}>
          {readonly ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{brief.generalNotes}</p> : <Editable value={brief.generalNotes} onChange={v => set("generalNotes", v)} multiline placeholder="Any general production notes…" />}
        </div>
      </Section>
    </div>
  );
}

// ─── CONCEPT PAGE ─────────────────────────────────────────────────────────────
function ConceptPage({ concept, onChange, readonly = false }) {
  const up = (k, v) => onChange({ ...concept, [k]: v });
  const upN = (p, k, v) => onChange({ ...concept, [p]: { ...(concept[p] || {}), [k]: v } });
  const upArr = (k, i, v) => { const a = [...(concept[k] || [])]; a[i] = v; onChange({ ...concept, [k]: a }); };
  const delArr = (k, i) => onChange({ ...concept, [k]: (concept[k] || []).filter((_, j) => j !== i) });
  const addArr = (k, item) => onChange({ ...concept, [k]: [...(concept[k] || []), item] });
  const upScript = (k, v) => onChange({ ...concept, script: { ...(concept.script || {}), [k]: v } });

  return (
    <div style={{ maxWidth: 760, padding: "60px 76px 120px" }}>
      <div style={{ fontSize: 48, marginBottom: 10 }}>{concept.emoji || "🎬"}</div>
      <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>Concept</div>
      {readonly
        ? <h1 style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 8px", color: "#37352f", lineHeight: 1.15 }}>{concept.title}</h1>
        : <h1 contentEditable suppressContentEditableWarning onBlur={e => up("title", e.target.innerText)} style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 8px", outline: "none", color: "#37352f", lineHeight: 1.15 }}>{concept.title}</h1>
      }
      <div style={{ fontSize: 15, color: "#9b9a97", fontStyle: "italic", marginBottom: 26, lineHeight: 1.6 }}>
        {readonly ? <p style={{ margin: 0 }}>{concept.logline}</p> : <Editable value={concept.logline} onChange={v => up("logline", v)} placeholder="One sentence about this concept…" />}
      </div>
      <div style={{ border: "1px solid #f1f0ef", borderRadius: 10, overflow: "hidden", marginBottom: 36 }}>
        <PropRow label="Type">{readonly ? concept.type : <Editable value={concept.type} onChange={v => up("type", v)} placeholder="e.g. Music Video" />}</PropRow>
        <PropRow label="Deliverable">{readonly ? concept.deliverableFormat : <Editable value={concept.deliverableFormat} onChange={v => up("deliverableFormat", v)} placeholder="e.g. 4-min video + 60-sec reel" />}</PropRow>
      </div>

      <Section emoji="📋" title="Concept Description">
        <div style={{ fontSize: 15, lineHeight: 1.95 }}>
          {readonly ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{concept.description}</p> : <Editable value={concept.description} onChange={v => up("description", v)} multiline placeholder="Describe this concept…" />}
        </div>
      </Section><HR />

      <Section emoji="🎭" title="Mood & Inspiration">
        <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 12 }}>
          {(concept.moodKeywords || []).map((k, i) => readonly
            ? <span key={i} style={{ background: "#fdeee4", color: "#b94a1a", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 500, margin: "2px 3px" }}>{k}</span>
            : <Tag key={i} value={k} bg="#fdeee4" color="#b94a1a" onEdit={v => upArr("moodKeywords", i, v)} onDelete={() => delArr("moodKeywords", i)} />
          )}
          {!readonly && <AddBtn label="Add" onClick={() => addArr("moodKeywords", "mood")} />}
        </div>
        <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Visual References & Links</div>
        <p style={{ fontSize: 12, color: "#c4c3bf", marginBottom: 8, fontStyle: "italic" }}>Paste a URL or type a reference name.</p>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {(concept.inspiration || []).map((r, i) => readonly
            ? (isURL(r)
                ? <a key={i} href={r} target="_blank" rel="noopener noreferrer" style={{ background: "#e8f0fe", color: "#1a56c4", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 500, margin: "2px 3px", textDecoration: "none" }}>{r.replace(/^https?:\/\//, "").split("/")[0]}</a>
                : <span key={i} style={{ background: "#e8f0fe", color: "#1a56c4", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 500, margin: "2px 3px" }}>{r}</span>
              )
            : <Tag key={i} value={r} bg="#e8f0fe" color="#1a56c4" onEdit={v => upArr("inspiration", i, v)} onDelete={() => delArr("inspiration", i)} />
          )}
          {!readonly && <AddBtn label="Add reference or paste link" onClick={() => addArr("inspiration", "https://")} />}
        </div>
      </Section><HR />

      <Section emoji="📍" title="Locations">
        {(concept.locations || []).map((loc, i) => (
          <div key={i} style={{ background: "#f7f6f3", borderRadius: 8, padding: "14px 16px", marginBottom: 10, border: "1px solid #eeece8" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{readonly ? loc.name : <Editable value={loc.name} onChange={v => upArr("locations", i, { ...loc, name: v })} placeholder="Location name" />}</div>
                <div style={{ fontSize: 11, color: "#e97942", fontWeight: 600, marginBottom: 8 }}>{readonly ? loc.vibe : <Editable value={loc.vibe} onChange={v => upArr("locations", i, { ...loc, vibe: v })} placeholder="Vibe tag" />}</div>
                <div style={{ fontSize: 13, color: "#55534e", lineHeight: 1.75, marginBottom: 8 }}>{readonly ? <p style={{ margin: 0 }}>{loc.description}</p> : <Editable value={loc.description} onChange={v => upArr("locations", i, { ...loc, description: v })} multiline placeholder="Describe…" />}</div>
                <div style={{ borderTop: "1px solid #e8e4dc", paddingTop: 8, fontSize: 12, color: "#9b9a97" }}>
                  <span style={{ fontWeight: 600, color: "#55534e" }}>Shot opportunities: </span>
                  {readonly ? loc.shots : <Editable value={loc.shots} onChange={v => upArr("locations", i, { ...loc, shots: v })} multiline placeholder="What can we capture here?" />}
                </div>
              </div>
              {!readonly && <button onClick={() => delArr("locations", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, marginLeft: 10 }}>✕</button>}
            </div>
          </div>
        ))}
        {!readonly && <AddBtn label="Add location" onClick={() => addArr("locations", { name: "New Location", vibe: "", description: "", shots: "" })} />}
      </Section><HR />

      <Section emoji="💡" title="Lighting">
        <div style={{ border: "1px solid #f1f0ef", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
          <PropRow label="Style"><span style={{ fontWeight: 600 }}>{readonly ? concept.lighting?.style : <Editable value={concept.lighting?.style} onChange={v => upN("lighting", "style", v)} placeholder="e.g. Golden Hour Natural" />}</span></PropRow>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.85, color: "#55534e", marginBottom: 14 }}>
          {readonly ? <p style={{ margin: 0 }}>{concept.lighting?.description}</p> : <Editable value={concept.lighting?.description} onChange={v => upN("lighting", "description", v)} multiline placeholder="Describe the lighting approach…" />}
        </div>
        <div style={{ background: "#f9f8f6", borderRadius: 6, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Technical Notes</div>
          <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", color: "#55534e", lineHeight: 1.75 }}>
            {readonly ? concept.lighting?.technical : <Editable value={concept.lighting?.technical} onChange={v => upN("lighting", "technical", v)} multiline placeholder="Camera settings, equipment…" />}
          </div>
        </div>
      </Section><HR />

      <Section emoji="🎨" title="Color Palette">
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          {(concept.colorHex || []).map((h, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: h, border: "1px solid rgba(0,0,0,0.08)" }} />
              <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97" }}>{h}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, color: "#55534e", lineHeight: 1.75 }}>
          {readonly ? <p style={{ margin: 0 }}>{concept.colorDescription}</p> : <Editable value={concept.colorDescription} onChange={v => up("colorDescription", v)} multiline placeholder="Describe the palette…" />}
        </div>
      </Section><HR />

      <Section emoji="👗" title="Wardrobe & Styling">
        {(concept.wardrobe || []).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ color: "#e97942" }}>→</span>
            <div style={{ flex: 1, fontSize: 14 }}>{readonly ? item : <Editable value={item} onChange={v => upArr("wardrobe", i, v)} />}</div>
            {!readonly && <button onClick={() => delArr("wardrobe", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 11 }}>✕</button>}
          </div>
        ))}
        {!readonly && <AddBtn label="Add item" onClick={() => addArr("wardrobe", "New item")} />}
        {concept.wardrobeNotes && <div style={{ fontSize: 13, color: "#9b9a97", borderLeft: "3px solid #e8e4dc", paddingLeft: 14, marginTop: 12 }}>{readonly ? concept.wardrobeNotes : <Editable value={concept.wardrobeNotes} onChange={v => up("wardrobeNotes", v)} multiline />}</div>}
      </Section><HR />

      <Section emoji="🎪" title="Props">
        {(concept.props || []).map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <span style={{ color: "#9b9a97" }}>·</span>
            <div style={{ flex: 1, fontSize: 14 }}>{readonly ? p : <Editable value={p} onChange={v => upArr("props", i, v)} />}</div>
            {!readonly && <button onClick={() => delArr("props", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 11 }}>✕</button>}
          </div>
        ))}
        {!readonly && <AddBtn label="Add prop" onClick={() => addArr("props", "New prop")} />}
      </Section><HR />

      <Section emoji="🎥" title="Shot List">
        <div style={{ borderTop: "1px solid #f1f0ef" }}>
          <div style={{ display: "grid", gridTemplateColumns: "36px 90px 1fr 90px 24px", gap: 8, padding: "6px 0", borderBottom: "1px solid #e8e4dc" }}>
            {["#", "Type", "Description", "Lens", ""].map((h, i) => <div key={i} style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>)}
          </div>
          {(concept.shotList || []).map((shot, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 90px 1fr 90px 24px", gap: 8, alignItems: "start", padding: "10px 0", borderBottom: "1px solid #f7f6f3" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9b9a97", paddingTop: 4 }}>{shot.number || String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e97942" }}>{readonly ? shot.type : <Editable value={shot.type} onChange={v => upArr("shotList", i, { ...shot, type: v })} placeholder="Type" />}</div>
              <div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>{readonly ? shot.description : <Editable value={shot.description} onChange={v => upArr("shotList", i, { ...shot, description: v })} multiline placeholder="Describe…" />}</div>
                {shot.notes && <div style={{ fontSize: 11, color: "#9b9a97", marginTop: 2 }}>{readonly ? shot.notes : <Editable value={shot.notes} onChange={v => upArr("shotList", i, { ...shot, notes: v })} placeholder="Notes…" />}</div>}
              </div>
              <div style={{ fontSize: 11, color: "#9b9a97" }}>{readonly ? shot.lens : <Editable value={shot.lens} onChange={v => upArr("shotList", i, { ...shot, lens: v })} placeholder="Lens" />}</div>
              {!readonly && <button onClick={() => delArr("shotList", i)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, paddingTop: 4 }}>✕</button>}
            </div>
          ))}
        </div>
        {!readonly && <div style={{ marginTop: 8 }}><AddBtn label="Add shot" onClick={() => addArr("shotList", { number: String((concept.shotList?.length || 0) + 1).padStart(2, "0"), type: "B-Roll", description: "", lens: "", notes: "" })} /></div>}
      </Section><HR />

      <Section emoji="📝" title="Script Outline">
        {[["Opening Hook", "hook"], ["Act I — Setup", "act1"], ["Act II — Journey", "act2"], ["Act III — Resolution", "act3"], ["Closing / CTA", "cta"]].map(([label, key]) => (
          <div key={key} style={{ background: "#f9f8f6", borderLeft: "3px solid #e8e4dc", padding: "14px 18px", borderRadius: "0 8px 8px 0", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 14, lineHeight: 1.85 }}>
              {readonly ? <p style={{ margin: 0 }}>{concept.script?.[key]}</p> : <Editable value={concept.script?.[key]} onChange={v => upScript(key, v)} multiline placeholder={`Write the ${label.toLowerCase()}…`} />}
            </div>
          </div>
        ))}
      </Section><HR />

      <Section emoji="✍️" title="Director's Notes">
        <div style={{ fontSize: 15, lineHeight: 1.95, color: "#55534e", fontStyle: "italic", borderLeft: "3px solid #e97942", paddingLeft: 18 }}>
          {readonly ? <p style={{ margin: 0 }}>{concept.directorNotes}</p> : <Editable value={concept.directorNotes} onChange={v => up("directorNotes", v)} multiline placeholder="Your creative vision for this concept…" />}
        </div>
      </Section>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ projects, onOpen, onNew, onDelete, onStatusChange }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const filtered = [...projects].filter(p => {
    const q = search.toLowerCase();
    const ms = !q || [p.brief.projectTitle, p.brief.clientName, p.brief.projectType].some(s => s?.toLowerCase().includes(q));
    return ms && (filter === "All" || p.status === filter);
  }).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ borderBottom: "1px solid #f1f0ef", padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#37352f", fontWeight: 500, letterSpacing: "0.08em" }}>FRAME BRIEF</span>
        </div>
        <button onClick={onNew} style={{ background: "#37352f", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 6, fontFamily: "'Lora',serif", fontSize: 13, cursor: "pointer" }}>+ New Brief</button>
      </div>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: "#37352f", marginBottom: 6, letterSpacing: "-0.02em" }}>Projects</h1>
        <p style={{ fontSize: 15, color: "#9b9a97", marginBottom: 32, fontStyle: "italic" }}>All your production briefs in one place.</p>
        <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#9b9a97" }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by client, project type, title…"
              style={{ width: "100%", border: "1px solid #e8e4dc", borderRadius: 8, padding: "10px 14px 10px 36px", fontFamily: "'Lora',serif", fontSize: 13, color: "#37352f", outline: "none", background: "#fafaf9" }}
              onFocus={e => e.target.style.borderColor = "#37352f"} onBlur={e => e.target.style.borderColor = "#e8e4dc"} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["All", ...STATUS_OPTIONS].map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{ padding: "8px 14px", borderRadius: 20, border: "1px solid", borderColor: filter === s ? "#37352f" : "#e8e4dc", background: filter === s ? "#37352f" : "transparent", color: filter === s ? "#fff" : "#9b9a97", fontFamily: "'Lora',serif", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{s}</button>
            ))}
          </div>
        </div>
        {filtered.length === 0
          ? <div style={{ textAlign: "center", padding: "80px 40px" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
              <p style={{ fontSize: 18, fontWeight: 600, color: "#37352f", marginBottom: 8 }}>{search || filter !== "All" ? "No projects match" : "No projects yet"}</p>
              <p style={{ fontSize: 14, color: "#9b9a97", marginBottom: 24 }}>{search || filter !== "All" ? "Try different filters" : "Create your first production brief."}</p>
              {!search && filter === "All" && <button onClick={onNew} style={{ background: "#37352f", color: "#fff", border: "none", padding: "11px 24px", borderRadius: 6, fontFamily: "'Lora',serif", fontSize: 14, cursor: "pointer" }}>+ Create First Brief</button>}
            </div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {filtered.map(p => (
                <div key={p.id} onClick={() => onOpen(p.id)} style={{ border: "1px solid #f1f0ef", borderRadius: 10, padding: "20px", background: "#fafaf9", cursor: "pointer", transition: "all .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f0ede8"; e.currentTarget.style.borderColor = "#e0ddd8"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fafaf9"; e.currentTarget.style.borderColor = "#f1f0ef"; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <span style={{ fontSize: 28 }}>{p.brief.coverEmoji || "🎬"}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={e => e.stopPropagation()}>
                      <StatusBadge status={p.status} onChange={s => onStatusChange(p.id, s)} />
                      <button onClick={e => { e.stopPropagation(); if (window.confirm("Delete this project?")) onDelete(p.id); }}
                        style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
                        onMouseEnter={e => e.currentTarget.style.color = "#c0392b"} onMouseLeave={e => e.currentTarget.style.color = "#ddd"}>🗑</button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#37352f", marginBottom: 4, lineHeight: 1.3 }}>{p.brief.projectTitle || "Untitled"}</div>
                  <div style={{ fontSize: 12, color: "#9b9a97", marginBottom: 10 }}>{p.brief.clientName}{p.brief.projectType ? ` · ${p.brief.projectType}` : ""}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                    {(p.brief.concepts || []).map((c, i) => <span key={i} style={{ fontSize: 11, background: "#f1f0ef", borderRadius: 20, padding: "2px 8px", color: "#9b9a97" }}>{c.emoji} {c.title}</span>)}
                  </div>
                  {/* Todo progress */}
                  {((p.brief.clientActionItems?.length || 0) + (p.brief.internalTodos?.length || 0)) > 0 && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                      {p.brief.clientActionItems?.length > 0 && <span style={{ fontSize: 11, color: "#1e7e34" }}>✅ {p.brief.clientActionItems.filter(t => t.done).length}/{p.brief.clientActionItems.length}</span>}
                      {p.brief.internalTodos?.length > 0 && <span style={{ fontSize: 11, color: "#b94a1a" }}>🔒 {p.brief.internalTodos.filter(t => t.done).length}/{p.brief.internalTodos.length}</span>}
                    </div>
                  )}
                  {p.docCount > 0 && <div style={{ fontSize: 11, color: "#9b9a97", marginBottom: 6 }}>📎 {p.docCount} doc{p.docCount > 1 ? "s" : ""}</div>}
                  <div style={{ fontSize: 11, color: "#c4c3bf", fontFamily: "'IBM Plex Mono',monospace" }}>Updated {new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

// ─── Client Share View ────────────────────────────────────────────────────────
function ShareView({ project, onClose }) {
  const brief = project.brief;
  const [page, setPage] = useState("overview");
  const conceptIdx = page.startsWith("concept-") ? parseInt(page.replace("concept-", "")) : -1;
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>
      <div style={{ borderBottom: "1px solid #f1f0ef", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>{brief.coverEmoji || "🎬"}</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#9b9a97", letterSpacing: "0.08em" }}>FRAME BRIEF</span>
          <span style={{ color: "#e8e4dc" }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{brief.projectTitle}</span>
          <span style={{ fontSize: 11, background: "#e6f4ea", color: "#1e7e34", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>Client View</span>
        </div>
        <button onClick={onClose} style={{ border: "1px solid #e8e4dc", padding: "6px 14px", borderRadius: 6, fontSize: 12, color: "#9b9a97", background: "transparent", cursor: "pointer", fontFamily: "'Lora',serif" }}>← Back to Edit</button>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ width: 222, borderRight: "1px solid #f1f0ef", padding: "16px 10px", overflowY: "auto", background: "#fafaf9", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#c4c3bf", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 10px", marginBottom: 4 }}>Project</div>
          <button className={`nb ${page === "overview" ? "on" : ""}`} onClick={() => setPage("overview")}><span style={{ fontSize: 15, flexShrink: 0 }}>📁</span><span>Overview</span></button>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#c4c3bf", textTransform: "uppercase", letterSpacing: "0.1em", padding: "14px 10px 4px" }}>Concepts</div>
          {(brief.concepts || []).map((c, i) => (
            <button key={i} className={`nb ${page === `concept-${i}` ? "on" : ""}`} onClick={() => setPage(`concept-${i}`)}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{c.emoji || "🎬"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || `Concept ${i + 1}`}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {page === "overview" && <OverviewPage brief={brief} setBrief={() => {}} goTo={setPage} readonly />}
          {conceptIdx >= 0 && brief.concepts?.[conceptIdx] && (
            <ConceptPage key={conceptIdx} concept={brief.concepts[conceptIdx]} onChange={() => {}} readonly />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────
function AIChatPanel({ chatLog, onSend, busy, onClose }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef();
  const chatEndRef = useRef();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatLog, busy]);

  // Auto-resize textarea like Notion
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  function handleSend() {
    if (!input.trim() || busy) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div style={{ width: 360, borderLeft: "1px solid #f1f0ef", display: "flex", flexDirection: "column", background: "#fafaf9", flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f0ef", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#37352f", marginBottom: 2 }}>✦ AI Creative Director</div>
          <div style={{ fontSize: 12, color: "#9b9a97" }}>Full chat history is remembered</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#9b9a97", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}
          onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {chatLog.length === 0 && (
          <div style={{ marginTop: 32 }}>
            <p style={{ color: "#c4c3bf", fontSize: 13, textAlign: "center", lineHeight: 1.95, fontStyle: "italic", marginBottom: 20 }}>
              I remember everything we discuss.<br />Try asking me to:
            </p>
            {["Add a drone shot to the shot list", "Make the script hook more emotional", "Add a rooftop location", "Create a new social content concept", "Add https://pinterest.com/myboard to references"].map(s => (
              <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #f1f0ef", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#55534e", cursor: "pointer", fontFamily: "'Lora',serif", marginBottom: 6, transition: "all .12s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f7f6f3"; e.currentTarget.style.borderColor = "#e0ddd8"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#f1f0ef"; }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {chatLog.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row", gap: 8 }}>
            {m.role === "assistant" && <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#37352f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginTop: 2 }}>✦</div>}
            <div style={{ maxWidth: "82%", background: m.role === "user" ? "#37352f" : "#fff", color: m.role === "user" ? "#fff" : "#37352f", borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px", padding: "10px 14px", fontSize: 13, lineHeight: 1.65, border: m.role === "assistant" ? "1px solid #f1f0ef" : "none", wordBreak: "break-word" }}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#37352f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>✦</div>
            <div style={{ background: "#fff", border: "1px solid #f1f0ef", borderRadius: "12px 12px 12px 4px", padding: "10px 14px" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4c3bf", animation: `bounce 1.2s ${i * 0.2}s infinite` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input — grows with content like Notion */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid #f1f0ef", background: "#fff" }}>
        <div style={{ border: "1px solid #e8e4dc", borderRadius: 10, overflow: "hidden", transition: "border-color .15s" }}
          onFocusCapture={e => e.currentTarget.style.borderColor = "#37352f"}
          onBlurCapture={e => e.currentTarget.style.borderColor = "#e8e4dc"}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask me to change anything… (Enter to send, Shift+Enter for new line)"
            style={{ width: "100%", border: "none", outline: "none", padding: "12px 14px", fontSize: 13, color: "#37352f", fontFamily: "'Lora',serif", lineHeight: 1.6, resize: "none", background: "transparent", minHeight: 44, maxHeight: 160, overflowY: "auto", display: "block" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: input ? "1px solid #f1f0ef" : "none" }}>
            {input ? (
              <>
                <span style={{ fontSize: 11, color: "#c4c3bf" }}>Shift+Enter for new line</span>
                <button onClick={handleSend} disabled={!input.trim() || busy}
                  style={{ background: "#37352f", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Lora',serif", opacity: !input.trim() || busy ? 0.4 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                  Send ↑
                </button>
              </>
            ) : (
              <span style={{ fontSize: 11, color: "#c4c3bf" }}>Ask me anything about this brief</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function FrameBrief() {
  const [screen, setScreen] = useState("dashboard");
  const [projects, setProjects] = useState(() => loadProjects());
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [page, setPage] = useState("overview");
  const [loadMsg, setLoadMsg] = useState("Reading your transcript…");
  const [errMsg, setErrMsg] = useState("");
  const [shareMode, setShareMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Full conversation history for persistent memory
  const [chatLog, setChatLog] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const brief = activeProject?.brief || null;

  useEffect(() => { saveProjects(projects); }, [projects]);

  const STEPS = ["Reading your transcript…", "Reading documents…", "Identifying deliverables…", "Building concept pages…", "Writing shot lists…", "Adding lighting & mood…", "Almost ready…"];
  useEffect(() => {
    if (screen !== "loading") return;
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % STEPS.length; setLoadMsg(STEPS[i]); }, 2000);
    return () => clearInterval(t);
  }, [screen]);

  function setBrief(updater) {
    setProjects(ps => ps.map(p => p.id === activeProjectId
      ? { ...p, brief: typeof updater === "function" ? updater(p.brief) : updater, updatedAt: Date.now() }
      : p));
  }

  function setStatus(id, status) {
    setProjects(ps => ps.map(p => p.id === id ? { ...p, status, updatedAt: Date.now() } : p));
  }

  function handleDocAdd(results) {
    setUploadedDocs(prev => [...prev, ...results]);
  }

  function handleDocRemove(idx) {
    setUploadedDocs(prev => prev.filter((d, i) => i !== idx));
  }

  async function generate() {
    const validDocs = uploadedDocs.filter(d => !d.error);
    if (!transcript.trim() && validDocs.length === 0) return;
    setErrMsg("");
    setScreen("loading");
    try {
      const userContent = [];
      for (const doc of validDocs.filter(d => d.type === "pdf")) {
        userContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 }, title: doc.name });
      }
      let promptText = "Create a production brief. Return only JSON.\n\n";
      if (transcript.trim()) promptText += `MEETING NOTES:\n${transcript.trim()}\n\n`;
      for (const doc of validDocs.filter(d => d.type === "text")) {
        promptText += `DOCUMENT (${doc.name}):\n${doc.content.slice(0, 8000)}\n\n`;
      }
      userContent.push({ type: "text", text: promptText });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userContent }] })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data?.error?.message || `API error ${res.status}`);
      const raw = (data.content || []).map(b => b.text || "").join("").trim();
      if (!raw) throw new Error("Empty response");
      let jsonStr = raw;
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) jsonStr = fenced[1].trim();
      else { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1); }
      // Clean common JSON issues before parsing
      jsonStr = jsonStr
        .replace(/,\s*}/g, '}')      // trailing commas in objects
        .replace(/,\s*]/g, ']')      // trailing commas in arrays
        .replace(/[\u2018\u2019]/g, "\'")  // smart quotes
        .replace(/[\u201C\u201D]/g, '"');   // smart double quotes
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed.concepts)) parsed.concepts = [];
      if (!parsed.clientActionItems) parsed.clientActionItems = [];
      if (!parsed.internalTodos) parsed.internalTodos = [];

      const newProject = { id: `proj-${Date.now()}`, brief: parsed, status: "Draft", docCount: validDocs.length, docNames: validDocs.map(d => d.name), createdAt: Date.now(), updatedAt: Date.now() };
      setProjects(ps => [newProject, ...ps]);
      setActiveProjectId(newProject.id);
      setPage("overview");
      setShareMode(false);
      setChatLog([]);
      setChatOpen(false);
      setUploadedDocs([]);
      setTranscript("");
      setScreen("doc");
    } catch (err) {
      console.error(err);
      setErrMsg(err.message || "Something went wrong.");
      setScreen("input");
    }
  }

  // ── Chat with full memory ──
  async function sendChat(msg) {
    if (!brief) return;
    // Add user message to log
    const userMsg = { role: "user", content: msg };
    const updatedLog = [...chatLog, userMsg];
    setChatLog(updatedLog);
    setChatBusy(true);

    try {
      // Build full conversation history for the API
      // System: brief context. Messages: full chat log
      const systemWithBrief = `You are a creative director AI refining a production brief for a video/photo production company.

You have full memory of this conversation — always refer back to previous messages when relevant.

When the user requests changes to the brief:
1. Make the change
2. Return the FULL updated brief JSON wrapped as: BRIEF_START{...}BRIEF_END
3. Then write a short friendly reply confirming what you changed

If the user asks where something was added or references a previous message, look back at the conversation history.

If the user shares a URL or link, add it to the references or inspiration section as-is so it becomes a clickable link.

Current brief:
${JSON.stringify(brief, null, 2)}`;

      // Send full conversation history
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8000,
          system: systemWithBrief,
          messages: updatedLog // full history
        })
      });

      const data = await res.json();
      const text = (data.content || []).map(b => b.text || "").join("");
      let reply = text;

      if (text.includes("BRIEF_START")) {
        const m = text.match(/BRIEF_START([\s\S]*?)BRIEF_END/);
        if (m) {
          try {
            const updated = JSON.parse(m[1].trim());
            setBrief(updated);
          } catch (e) { console.error("Brief parse error:", e); }
        }
        reply = text.replace(/BRIEF_START[\s\S]*?BRIEF_END/, "").trim();
      }

      const assistantMsg = { role: "assistant", content: reply || "Done! Brief updated." };
      setChatLog(prev => [...prev, assistantMsg]);
    } catch {
      setChatLog(prev => [...prev, { role: "assistant", content: "Something went wrong — try again." }]);
    } finally {
      setChatBusy(false);
    }
  }

  function addConcept() {
    const blank = { id: `c-${Date.now()}`, emoji: "🎬", title: "New Concept", type: "", logline: "", description: "", moodKeywords: [], inspiration: [], locations: [], lighting: { style: "", description: "", technical: "" }, colorHex: ["#f5f0e8", "#d4c5a9", "#8b7355"], colorDescription: "", wardrobe: [], wardrobeNotes: "", props: [], shotList: [], script: { hook: "", act1: "", act2: "", act3: "", cta: "" }, deliverableFormat: "", directorNotes: "" };
    const idx = (brief?.concepts || []).length;
    setBrief(b => ({ ...b, concepts: [...(b.concepts || []), blank] }));
    setPage(`concept-${idx}`);
  }

  function copyShareLink() {
    navigator.clipboard.writeText(`📋 ${brief?.projectTitle} — Production Brief\nShared via Frame Brief`).catch(() => {});
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  }

  const conceptIdx = page.startsWith("concept-") ? parseInt(page.replace("concept-", "")) : -1;
  const canGenerate = transcript.trim() || uploadedDocs.filter(d => !d.error).length > 0;

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body,#root{height:100%;font-family:'Lora',Georgia,serif;background:#fff;color:#37352f;}
    textarea,input{font-family:'Lora',Georgia,serif;}
    ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#e0ddd8;border-radius:4px;}
    .spin{animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}
    @keyframes bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-6px);}}
    .nb{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-size:13px;color:#37352f;text-align:left;font-family:'Lora',serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .1s;}
    .nb:hover{background:#f1f0ef;}.nb.on{background:#e8f0fe;color:#1a56c4;font-weight:700;}
    .tbtn{border:1px solid #e8e4dc;padding:6px 14px;border-radius:6px;font-size:12px;color:#9b9a97;background:transparent;cursor:pointer;font-family:'Lora',serif;transition:all .15s;}
    .tbtn:hover{border-color:#37352f;color:#37352f;}.tbtn.on{background:#37352f;color:#fff;border-color:#37352f;}
  `;

  // ── Share view ──
  if (screen === "doc" && shareMode && activeProject) return (
    <div style={{ height: "100vh" }}><style>{CSS}</style><ShareView project={activeProject} onClose={() => setShareMode(false)} /></div>
  );

  // ── Dashboard ──
  if (screen === "dashboard") return (
    <div><style>{CSS}</style>
      <Dashboard projects={projects}
        onOpen={id => { setActiveProjectId(id); setPage("overview"); setShareMode(false); setChatLog([]); setChatOpen(false); setScreen("doc"); }}
        onNew={() => { setTranscript(""); setUploadedDocs([]); setErrMsg(""); setScreen("input"); }}
        onDelete={id => setProjects(ps => ps.filter(p => p.id !== id))}
        onStatusChange={(id, s) => setProjects(ps => ps.map(p => p.id === id ? { ...p, status: s, updatedAt: Date.now() } : p))} />
    </div>
  );

  // ── Input ──
  if (screen === "input") return (
    <div style={{ minHeight: "100vh", background: "#fff" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 28px 80px" }}>
        <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: "#9b9a97", fontSize: 13, cursor: "pointer", fontFamily: "'Lora',serif", marginBottom: 40, display: "flex", alignItems: "center", gap: 6 }}>← All Projects</button>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: "#37352f", letterSpacing: "-0.02em", marginBottom: 10 }}>New Brief</h1>
          <p style={{ color: "#9b9a97", fontSize: 15, fontStyle: "italic", lineHeight: 1.6 }}>Add your meeting notes and any client documents. Each deliverable gets its own concept page.</p>
        </div>
        {errMsg && <div style={{ background: "#fff2f2", border: "1px solid #ffc9c9", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#c0392b", lineHeight: 1.65 }}><strong>Error:</strong> {errMsg}</div>}
        <div style={{ border: `1px solid ${transcript.length > STANDARD_LIMIT ? (transcript.length >= HARD_LIMIT ? "#ffc9c9" : "#fde8c8") : "#e8e4dc"}`, borderRadius: 10, padding: "22px 24px", marginBottom: 16, background: "#fafaf9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#9b9a97", letterSpacing: "0.08em", textTransform: "uppercase" }}>Meeting Notes or Transcript</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {transcript.length > STANDARD_LIMIT && transcript.length < HARD_LIMIT && (
                <span style={{ fontSize: 11, background: "#fef3e2", color: "#b45309", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>Extended · Pro required</span>
              )}
              {transcript.length >= HARD_LIMIT && (
                <span style={{ fontSize: 11, background: "#fff2f2", color: "#c0392b", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>Limit reached</span>
              )}
              <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: transcript.length >= HARD_LIMIT ? "#c0392b" : transcript.length > STANDARD_LIMIT ? "#b45309" : "#c4c3bf" }}>
                {transcript.length.toLocaleString()} / {STANDARD_LIMIT.toLocaleString()}
              </span>
            </div>
          </div>
          <textarea rows={10} value={transcript}
            onChange={e => { if (e.target.value.length <= HARD_LIMIT) setTranscript(e.target.value); }}
            placeholder={"Paste your client meeting notes or transcript here…\n\nDescribe every deliverable discussed — each one becomes its own concept page."}
            style={{ width: "100%", border: "none", outline: "none", resize: "none", background: "transparent", fontSize: 14, lineHeight: 1.82, color: "#37352f" }} />
          {transcript.length > STANDARD_LIMIT && transcript.length < HARD_LIMIT && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#fef3e2", borderRadius: 6, fontSize: 12, color: "#92400e", lineHeight: 1.65 }}>
              ⚡ <strong>Extended transcript</strong> — your notes exceed the standard limit (approx. 30-min meeting). Transcripts over {STANDARD_LIMIT.toLocaleString()} characters will require a Pro plan upgrade in the full product. This demo will still process it.
            </div>
          )}
          {transcript.length >= HARD_LIMIT && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#fff2f2", borderRadius: 6, fontSize: 12, color: "#991b1b", lineHeight: 1.65 }}>
              🚫 <strong>Limit reached</strong> — maximum {HARD_LIMIT.toLocaleString()} characters (approx. 60-min meeting). Please shorten your notes or split into a second project.
            </div>
          )}
        </div>
        <div style={{ border: "1px solid #e8e4dc", borderRadius: 10, padding: "22px 24px", marginBottom: 20, background: "#fafaf9" }}>
          <DocUpload docs={uploadedDocs} onAdd={handleDocAdd} onRemove={handleDocRemove} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={generate} disabled={!canGenerate}
            style={{ background: "#37352f", color: "#fff", border: "none", padding: "12px 30px", borderRadius: 6, fontFamily: "'Lora',serif", fontSize: 14, cursor: canGenerate ? "pointer" : "not-allowed", opacity: canGenerate ? 1 : 0.45 }}>
            Generate Brief →
          </button>
          <button onClick={() => { setTranscript(SAMPLE); setErrMsg(""); }}
            style={{ background: "transparent", color: "#9b9a97", border: "1px solid #e8e4dc", padding: "11px 20px", borderRadius: 6, fontFamily: "'Lora',serif", fontSize: 13, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#37352f"; e.currentTarget.style.color = "#37352f"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e8e4dc"; e.currentTarget.style.color = "#9b9a97"; }}>
            Load Sample
          </button>
          {uploadedDocs.filter(d => !d.error).length > 0 && (
            <span style={{ fontSize: 12, color: "#1e7e34", fontStyle: "italic" }}>+ {uploadedDocs.filter(d => !d.error).length} doc{uploadedDocs.filter(d => !d.error).length > 1 ? "s" : ""} attached</span>
          )}
        </div>
      </div>
    </div>
  );

  // ── Loading ──
  if (screen === "loading") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <style>{CSS}</style>
      <div className="spin" style={{ width: 28, height: 28, border: "2px solid #f1f0ef", borderTop: "2px solid #37352f", borderRadius: "50%" }} />
      <p style={{ color: "#9b9a97", fontStyle: "italic", fontSize: 15 }}>{loadMsg}</p>
    </div>
  );

  // ── Doc ──
  if (screen === "doc" && brief) return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{CSS}</style>
      <div style={{ borderBottom: "1px solid #f1f0ef", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)", flexShrink: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <button onClick={() => setScreen("dashboard")} style={{ background: "none", border: "none", color: "#9b9a97", cursor: "pointer", fontSize: 13, fontFamily: "'Lora',serif", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>← Projects</button>
          <span style={{ color: "#e8e4dc" }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brief.projectTitle}</span>
          {activeProject && <StatusBadge status={activeProject.status} onChange={s => setStatus(activeProjectId, s)} />}
          {activeProject?.docCount > 0 && <span style={{ fontSize: 11, color: "#9b9a97", flexShrink: 0 }}>📎 {activeProject.docCount}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button className="tbtn" onClick={copyShareLink}>{copiedShare ? "✓ Copied!" : "🔗 Share"}</button>
          <button className="tbtn" onClick={() => setShareMode(true)}>👁 Client View</button>
          <button className={`tbtn ${chatOpen ? "on" : ""}`} onClick={() => setChatOpen(o => !o)}>{chatOpen ? "✕ Close AI" : "✦ Refine with AI"}</button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 222, borderRight: "1px solid #f1f0ef", padding: "16px 10px", overflowY: "auto", background: "#fafaf9", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#c4c3bf", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 10px", marginBottom: 4 }}>Project</div>
          <button className={`nb ${page === "overview" ? "on" : ""}`} onClick={() => setPage("overview")}><span style={{ fontSize: 15, flexShrink: 0 }}>📁</span><span>Overview</span></button>
          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#c4c3bf", textTransform: "uppercase", letterSpacing: "0.1em", padding: "14px 10px 4px" }}>Concepts</div>
          {(brief.concepts || []).map((c, i) => (
            <button key={i} className={`nb ${page === `concept-${i}` ? "on" : ""}`} onClick={() => setPage(`concept-${i}`)}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{c.emoji || "🎬"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || `Concept ${i + 1}`}</span>
            </button>
          ))}
          <button onClick={addConcept} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 10px", border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "#9b9a97", fontFamily: "'Lora',serif", marginTop: 6, borderRadius: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = "#37352f"} onMouseLeave={e => e.currentTarget.style.color = "#9b9a97"}>
            + Add Concept
          </button>

          {/* Todo progress in sidebar */}
          {((brief.clientActionItems?.length || 0) + (brief.internalTodos?.length || 0)) > 0 && (
            <div style={{ marginTop: 16, padding: "12px 10px", borderTop: "1px solid #f1f0ef" }}>
              <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: "#c4c3bf", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Progress</div>
              {brief.clientActionItems?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9b9a97", marginBottom: 3 }}>
                    <span>✅ Client</span><span>{brief.clientActionItems.filter(t => t.done).length}/{brief.clientActionItems.length}</span>
                  </div>
                  <div style={{ height: 4, background: "#f1f0ef", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#1e7e34", width: `${(brief.clientActionItems.filter(t => t.done).length / brief.clientActionItems.length) * 100}%`, transition: "width .3s" }} />
                  </div>
                </div>
              )}
              {brief.internalTodos?.length > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9b9a97", marginBottom: 3 }}>
                    <span>🔒 Internal</span><span>{brief.internalTodos.filter(t => t.done).length}/{brief.internalTodos.length}</span>
                  </div>
                  <div style={{ height: 4, background: "#f1f0ef", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#e97942", width: `${(brief.internalTodos.filter(t => t.done).length / brief.internalTodos.length) * 100}%`, transition: "width .3s" }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {page === "overview" && <OverviewPage brief={brief} setBrief={setBrief} goTo={setPage} />}
          {conceptIdx >= 0 && brief.concepts?.[conceptIdx] && (
            <ConceptPage key={conceptIdx} concept={brief.concepts[conceptIdx]}
              onChange={val => setBrief(b => { const c = [...(b.concepts || [])]; c[conceptIdx] = val; return { ...b, concepts: c }; })} />
          )}
        </div>

        {/* AI Chat — expanded with memory */}
        {chatOpen && (
          <AIChatPanel
            chatLog={chatLog}
            onSend={sendChat}
            busy={chatBusy}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>
    </div>
  );

  return null;
}
