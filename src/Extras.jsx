import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, getDoc,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import "./extras.css";

const WISUDA = new Date("2026-10-03T00:00:00+07:00").getTime();
export const daysSinceWisuda = () => Math.floor((Date.now() - WISUDA) / 86400000);

const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const toInputDate = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);

/* ---------- PANEL-PANEL ---------- */
function LetterPanel({ letter }) {
  const [opened, setOpened] = useState(false);
  if (!opened) {
    return (
      <button type="button" className="envelope" onClick={() => setOpened(true)}>
        <span className="env-flap" />
        <span className="env-seal">♥</span>
        <span className="env-hint">Ketuk untuk membuka</span>
      </button>
    );
  }
  return (
    <div className="x-letter">
      <span className="letter-label">{letter?.title || "Sebuah surat"}</span>
      <p className="letter-text">
        {letter?.text || "Surat ini belum diisi. Isi lewat halaman admin."}
      </p>
    </div>
  );
}

function ReasonPanel({ items }) {
  const [text, setText] = useState("");
  const pick = () => {
    if (!items.length) return;
    let t;
    do { t = items[Math.floor(Math.random() * items.length)]; }
    while (items.length > 1 && t === text);
    setText(t);
  };
  return (
    <div className="x-reason">
      <p key={text} className="reason-text">
        {text || (items.length ? "Ketuk tombol di bawah." : "Belum ada alasan yang ditulis.")}
      </p>
      <button type="button" className="x-btn" onClick={pick} disabled={!items.length}>
        Satu alasan untukmu
      </button>
    </div>
  );
}

function PlansPanel({ plans }) {
  const [text, setText] = useState("");
  const add = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    try { await addDoc(collection(db, "plans"), { text: t, done: false, createdAt: serverTimestamp() }); }
    catch { alert("Gagal menambah rencana."); }
  };
  const toggle = (p) => updateDoc(doc(db, "plans", p.id), { done: !p.done }).catch(() => {});
  const remove = (p) => window.confirm("Hapus rencana ini?") && deleteDoc(doc(db, "plans", p.id)).catch(() => {});
  return (
    <div className="x-plans">
      {plans.length === 0 && <p className="x-empty">Belum ada rencana. Tulis yang pertama di bawah.</p>}
      <ul>
        {plans.map((p) => (
          <li key={p.id} className={p.done ? "is-done" : ""}>
            <label>
              <input type="checkbox" checked={!!p.done} onChange={() => toggle(p)} />
              <span>{p.text}</span>
            </label>
            <button type="button" aria-label="Hapus" onClick={() => remove(p)}>×</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="x-add">
        <input value={text} maxLength={120} onChange={(e) => setText(e.target.value)}
          placeholder="Tambah rencana berdua…" />
        <button type="submit" className="x-btn">Tambah</button>
      </form>
    </div>
  );
}

function CapsulePanel({ capsules }) {
  const now = Date.now();
  if (!capsules.length) return <p className="x-empty">Belum ada kapsul waktu.</p>;
  return (
    <div className="x-caps">
      {capsules.map((c) =>
        now >= c.openAt ? (
          <article key={c.id} className="cap is-open">
            <span className="cap-date">{fmtDate(c.openAt)}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </article>
        ) : (
          <article key={c.id} className="cap is-locked">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <h3>{c.title}</h3>
              <span className="cap-date">
                Terbuka {fmtDate(c.openAt)} · {Math.ceil((c.openAt - now) / 86400000)} hari lagi
              </span>
            </div>
          </article>
        )
      )}
    </div>
  );
}

const TABS = [
  ["letter", "Surat"], ["reasons", "Alasan"], ["plans", "Rencana"], ["capsule", "Kapsul"],
];

export default function Extras({ letter }) {
  const [open, setOpen] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [plans, setPlans] = useState([]);
  const [capsules, setCapsules] = useState([]);

  useEffect(() => {
    const u1 = onSnapshot(doc(db, "settings", "reasons"),
      (d) => setReasons(d.exists() ? d.data().items || [] : []), () => {});
    const u2 = onSnapshot(query(collection(db, "plans"), orderBy("createdAt", "asc")),
      (s) => setPlans(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    const u3 = onSnapshot(collection(db, "capsules"),
      (s) => setCapsules(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.openAt - b.openAt)),
      () => {});
    return () => { u1(); u2(); u3(); };
  }, []);

  return (
    <section className="extras">
      <div className="xrow" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={open === k}
            className={open === k ? "is-on" : ""} onClick={() => setOpen(open === k ? null : k)}>
            {label}
          </button>
        ))}
      </div>
      {open && (
        <div className="xpanel" key={open}>
          {open === "letter" && <LetterPanel letter={letter} />}
          {open === "reasons" && <ReasonPanel items={reasons} />}
          {open === "plans" && <PlansPanel plans={plans} />}
          {open === "capsule" && <CapsulePanel capsules={capsules} />}
        </div>
      )}
    </section>
  );
}

/* ---------- HALAMAN ADMIN (/?admin) ---------- */
export function Admin() {
  const code = import.meta.env.VITE_ADMIN_CODE;
  const [ok, setOk] = useState(!code);
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [reasonsText, setReasonsText] = useState("");
  const [caps, setCaps] = useState([]);
  const [cap, setCap] = useState({ id: null, title: "", date: "", text: "" });

  useEffect(() => {
    if (!ok) return;
    getDoc(doc(db, "settings", "letter")).then((d) => {
      if (d.exists()) { setTitle(d.data().title || ""); setText(d.data().text || ""); }
    }).catch(() => {});
    getDoc(doc(db, "settings", "reasons")).then((d) => {
      if (d.exists()) setReasonsText((d.data().items || []).join("\n"));
    }).catch(() => {});
    return onSnapshot(collection(db, "capsules"),
      (s) => setCaps(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.openAt - b.openAt)),
      () => {});
  }, [ok]);

  const run = async (fn, okMsg) => {
    try { await fn(); setMsg(okMsg); } catch { setMsg("Gagal menyimpan."); }
  };

  if (!ok) {
    return (
      <div className="adm">
        <h1>Admin</h1>
        <input type="password" value={pass} placeholder="Kode" onChange={(e) => setPass(e.target.value)} />
        <button className="x-btn" onClick={() => (pass === code ? setOk(true) : setMsg("Kode salah."))}>Masuk</button>
        <p className="adm-msg">{msg}</p>
      </div>
    );
  }

  const saveCap = () => {
    if (!cap.title.trim() || !cap.date || !cap.text.trim()) { setMsg("Judul, tanggal, dan isi wajib diisi."); return; }
    const data = {
      title: cap.title.trim(), text: cap.text.trim(),
      openAt: new Date(`${cap.date}T00:00:00+07:00`).getTime(),
    };
    run(async () => {
      if (cap.id) await updateDoc(doc(db, "capsules", cap.id), data);
      else await addDoc(collection(db, "capsules"), data);
      setCap({ id: null, title: "", date: "", text: "" });
    }, "Kapsul tersimpan.");
  };

  return (
    <div className="adm">
      <a href="/" className="adm-back">← Kembali ke galeri</a>
      <h1>Admin</h1>
      <p className="adm-msg">{msg}</p>

      <h2>Surat</h2>
      <input value={title} placeholder="Judul kecil (opsional)" onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={7} value={text} placeholder="Isi surat" onChange={(e) => setText(e.target.value)} />
      <button className="x-btn" onClick={() => run(() => setDoc(doc(db, "settings", "letter"), { title, text }, { merge: true }), "Surat tersimpan.")}>
        Simpan surat
      </button>

      <h2>Alasan (satu per baris)</h2>
      <textarea rows={10} value={reasonsText} onChange={(e) => setReasonsText(e.target.value)} />
      <button className="x-btn" onClick={() => run(() => setDoc(doc(db, "settings", "reasons"),
        { items: reasonsText.split("\n").map((s) => s.trim()).filter(Boolean) }), "Alasan tersimpan.")}>
        Simpan alasan
      </button>

      <h2>Kapsul waktu</h2>
      <input value={cap.title} placeholder="Judul (tampil walau masih terkunci)"
        onChange={(e) => setCap({ ...cap, title: e.target.value })} />
      <input type="date" value={cap.date} onChange={(e) => setCap({ ...cap, date: e.target.value })} />
      <textarea rows={8} value={cap.text} placeholder="Isi pesan"
        onChange={(e) => setCap({ ...cap, text: e.target.value })} />
      <button className="x-btn" onClick={saveCap}>{cap.id ? "Perbarui kapsul" : "Tambah kapsul"}</button>
      {cap.id && <button className="x-btn x-ghost" onClick={() => setCap({ id: null, title: "", date: "", text: "" })}>Batal ubah</button>}
      <ul className="adm-list">
        {caps.map((c) => (
          <li key={c.id}>
            <span>{c.title} · {fmtDate(c.openAt)}</span>
            <button onClick={() => setCap({ id: c.id, title: c.title, date: toInputDate(c.openAt), text: c.text })}>Ubah</button>
            <button onClick={() => window.confirm("Hapus kapsul ini?") && run(() => deleteDoc(doc(db, "capsules", c.id)), "Kapsul dihapus.")}>Hapus</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
