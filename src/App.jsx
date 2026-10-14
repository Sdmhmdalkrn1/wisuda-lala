import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, onSnapshot, query, orderBy, serverTimestamp,
  deleteDoc, doc, updateDoc, setDoc,
} from "firebase/firestore";
import imageCompression from "browser-image-compression";
import { parse as parseExif } from "exifr";
import Extras, { Admin, daysSinceWisuda } from "./Extras.jsx";
import "./App.css";

const IMGBB_API_KEY =
  import.meta.env.VITE_IMGBB_KEY || "d2975f87630c09664c72c8f0347931c4";

// true = foto terbaru di atas; false = urut waktu foto diambil (pagi -> malam)
const NEWEST_FIRST = false;

const toMillis = (v) =>
  v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : Date.now();
const photoTime = (img) => img.takenAt ?? toMillis(img.createdAt);

// Baca tanggal dari file ASLI sebelum dikompres (kompresi membuang EXIF).
async function readTakenAt(file) {
  try {
    const exif = await parseExif(file, ["DateTimeOriginal", "CreateDate"]);
    const d = exif?.DateTimeOriginal || exif?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.getTime();
  } catch { /* pakai cadangan */ }
  return file.lastModified || Date.now();
}

// Sidik jari file asli (SHA-256) untuk mendeteksi unggahan ganda.
async function hashFile(file) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
}

// Gambar lewat proxy dulu; kalau gagal/lambat >7 dtk pakai link ImgBB asli.
const proxied = (url, w) =>
  `https://wsrv.nl/?url=${encodeURIComponent(url)}${w ? `&w=${w}&output=webp&q=82` : ""}`;

async function fetchBlob(url) {
  for (const u of [proxied(url), url]) {
    try {
      const r = await fetch(u);
      if (r.ok) return await r.blob();
    } catch { /* coba berikutnya */ }
  }
  throw new Error("fetch gagal");
}

const ICONS = {
  heart: "M12 20.5S4 15.8 4 9.9A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.3c0 5.9-8 10.6-8 10.6z",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  share: "M12 15V4m0 0L8 8m4-4l4 4M5 12v7h14v-7",
  cover: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4",
  pencil: "M4 20l1-4L16 5l3 3L8 19z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  close: "M6 6l12 12M18 6L6 18",
  prev: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  play: "M8 5l11 7-11 7z",
  pause: "M9 5v14M15 5v14",
};
function Icon({ name, size = 20, fill = "none" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={ICONS[name]} fill={fill} stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Photo({ url, width, alt, className, onLoad, ...rest }) {
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done || stage !== 0) return;
    const t = setTimeout(() => setStage(1), 7000);
    return () => clearTimeout(t);
  }, [done, stage]);
  return (
    <img {...rest} src={stage === 0 ? proxied(url, width) : url} alt={alt}
      className={className}
      onLoad={() => { setDone(true); onLoad && onLoad(); }}
      onError={() => setStage((s) => Math.min(s + 1, 1))} />
  );
}

const SKELETON_RATIOS = [1.3, 0.8, 1, 1.45, 0.9, 1.2, 0.75, 1.1];

function GalleryItem({ img, index, onOpen, onDelete, selecting, selected, onToggle }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <figure
      className={`tile ${loaded ? "is-loaded" : ""} ${selected ? "is-selected" : ""}`}
      onClick={() => (selecting ? onToggle(img.id) : onOpen(index))}
    >
      <Photo url={img.imageUrl} width={700} alt={`Foto wisuda ${index + 1}`}
        loading="lazy" onLoad={() => setLoaded(true)} />
      {selecting && <span className="tile-check">{selected ? "✓" : ""}</span>}
      {img.favorite && <span className="tile-fav"><Icon name="heart" size={14} fill="currentColor" /></span>}
      <button type="button" className="tile-delete" aria-label="Hapus foto"
        onClick={(e) => onDelete(img.id, e)}>
        <Icon name="trash" size={16} />
      </button>
    </figure>
  );
}

function Gallery() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [viewIndex, setViewIndex] = useState(null);
  const [filter, setFilter] = useState("all");
  const [letter, setLetter] = useState(null);
  const [coverId, setCoverId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const touchStartX = useRef(null);
  const toastTimer = useRef(null);

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (NEWEST_FIRST ? photoTime(b) - photoTime(a) : photoTime(a) - photoTime(b)));
      setImages(list);
      setLoading(false);
    }, () => setLoading(false));
    const unsubLetter = onSnapshot(doc(db, "settings", "letter"),
      (d) => setLetter(d.exists() ? d.data() : null), () => {});
    const unsubSite = onSnapshot(doc(db, "settings", "site"),
      (d) => setCoverId(d.exists() ? d.data().coverId || null : null), () => {});
    return () => { unsub(); unsubLetter(); unsubSite(); };
  }, []);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let failed = 0;
    const skipped = [];
    const known = new Set(images.map((i) => i.hash).filter(Boolean));
    for (const file of files) {
      try {
        const hash = await hashFile(file);
        if (known.has(hash)) {
          skipped.push(file.name);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          continue;
        }
        const takenAt = await readTakenAt(file);
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.5, maxWidthOrHeight: 1080, useWebWorker: true,
        });
        const formData = new FormData();
        formData.append("image", compressed);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
          { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error("Gagal upload ke ImgBB");
        await addDoc(collection(db, "gallery"), {
          imageUrl: data.data.url,
          deleteUrl: data.data.delete_url || null,
          takenAt,
          hash,
          createdAt: serverTimestamp(),
        });
        known.add(hash);
      } catch { failed += 1; }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setUploading(false);
    const notes = [];
    if (skipped.length > 0) {
      const names = skipped.slice(0, 5).join(", ") + (skipped.length > 5 ? ", …" : "");
      notes.push(`${skipped.length} foto dilewati karena sudah ada di galeri: ${names}`);
    }
    if (failed > 0) notes.push(`${failed} foto gagal diunggah. Coba unggah lagi ya.`);
    if (notes.length > 0) alert(notes.join("\n\n"));
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Hapus foto ini dari galeri?")) return;
    try { await deleteDoc(doc(db, "gallery", id)); }
    catch { alert("Foto gagal dihapus. Coba lagi."); }
  };

  const visible = useMemo(
    () => (filter === "fav" ? images.filter((i) => i.favorite) : images),
    [images, filter]
  );
  const favCount = useMemo(() => images.filter((i) => i.favorite).length, [images]);
  const current = viewIndex !== null ? visible[viewIndex] : null;
  const cover = images.find((i) => i.id === coverId) || images[0];
  const editing = current && editingId === current.id;

  const close = useCallback(() => setViewIndex(null), []);
  const next = useCallback(() => setViewIndex((i) => (i === null ? i : (i + 1) % visible.length)), [visible.length]);
  const prev = useCallback(() => setViewIndex((i) => (i === null ? i : (i - 1 + visible.length) % visible.length)), [visible.length]);

  useEffect(() => {
    if (viewIndex === null) return;
    const onKey = (e) => {
      if (editing) { if (e.key === "Escape") setEditingId(null); return; }
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = old; };
  }, [viewIndex, editing, close, next, prev]);

  useEffect(() => {
    if (viewIndex !== null && viewIndex >= visible.length) setViewIndex(null);
  }, [visible.length, viewIndex]);

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null || editing) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
  };

  const save = async (fn, okMsg) => {
    try { await fn(); okMsg && flash(okMsg); } catch { flash("Gagal menyimpan, coba lagi"); }
  };
  const toggleFav = () =>
    save(() => updateDoc(doc(db, "gallery", current.id), { favorite: !current.favorite }));
  const makeCover = () =>
    save(() => setDoc(doc(db, "settings", "site"), { coverId: current.id }, { merge: true }), "Dijadikan sampul");
  const startEdit = () => { setDraft(current.caption || ""); setEditingId(current.id); };
  const saveCaption = () =>
    save(() => updateDoc(doc(db, "gallery", current.id), { caption: draft.trim() }), "Keterangan disimpan")
      .then(() => setEditingId(null));

  const handleDownload = async () => {
    try {
      const blob = await fetchBlob(current.imageUrl);
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `wisuda-lala-${viewIndex + 1}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { window.open(current.imageUrl, "_blank"); }
  };

  const handleShare = async () => {
    try {
      const blob = await fetchBlob(current.imageUrl);
      const file = new File([blob], "wisuda-lala.jpg", { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: current.caption || "" });
        return;
      }
    } catch (err) { if (err?.name === "AbortError") return; }
    try {
      if (navigator.share) await navigator.share({ url: current.imageUrl });
      else { await navigator.clipboard.writeText(current.imageUrl); flash("Link foto disalin"); }
    } catch { /* dibatalkan */ }
  };

  const [playing, setPlaying] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [zip, setZip] = useState(null);

  const startSlideshow = () => {
    if (!visible.length) return;
    setViewIndex(0);
    setPlaying(true);
  };
  useEffect(() => { if (viewIndex === null) setPlaying(false); }, [viewIndex]);
  useEffect(() => {
    if (!playing || viewIndex === null || editing) return;
    const t = setTimeout(next, 4500);
    return () => clearTimeout(t);
  }, [playing, viewIndex, editing, next]);

  const toggleSelect = (id) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const downloadZip = async () => {
    const chosen = visible.filter((i) => selectedIds.includes(i.id));
    if (!chosen.length || zip) return;
    setZip({ done: 0, total: chosen.length });
    try {
      const { default: JSZip } = await import("jszip");
      const z = new JSZip();
      for (let i = 0; i < chosen.length; i++) {
        const blob = await fetchBlob(chosen[i].imageUrl);
        const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        z.file(`foto-${String(i + 1).padStart(2, "0")}.${ext}`, blob);
        setZip({ done: i + 1, total: chosen.length });
      }
      const out = await z.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = "wisuda-lala.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setSelecting(false);
      setSelectedIds([]);
    } catch { flash("Gagal membuat ZIP, coba lagi"); }
    setZip(null);
  };

  const lastTap = useRef(0);
  const [burst, setBurst] = useState(false);
  const onPhotoTap = (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      if (!current.favorite) toggleFav();
      setBurst(true);
      setTimeout(() => setBurst(false), 750);
    } else lastTap.current = now;
  };

  const openCover = () => {
    setFilter("all");
    setViewIndex(images.findIndex((i) => i.id === cover.id));
  };

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-text">
          <h1 className="hero-title">Untuk<br />Lala,</h1>
          <p className="hero-sub">Sebuah ruang kecil untuk momen bahagiamu, agar ceritanya tidak pernah pudar. Tentang lelah yang akhirnya terbayar lunas, dan kamu yang bersinar paling terang hari itu.</p>
          {daysSinceWisuda() >= 0 && (
            <p className="hero-days">
              {daysSinceWisuda() === 0 ? "Hari ini hari wisuda" : `${daysSinceWisuda()} hari sejak wisuda`}
            </p>
          )}
          <div className="hero-meta">
            <div className="count">
              <span className="count-num">{loading ? "–" : images.length}</span>
              <span className="count-label">foto</span>
            </div>
            <label className={`btn-upload ${uploading ? "is-busy" : ""}`} aria-disabled={uploading}>
              {uploading ? `Mengunggah ${progress.done}/${progress.total}` : "Tambah foto"}
              <input type="file" accept="image/*" multiple onChange={handleUpload} hidden disabled={uploading} />
            </label>
          </div>
          {uploading && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className="progress-bar" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
        <div className="hero-cover" aria-hidden={!cover}>
          {cover ? (
            <button type="button" className="arch" onClick={openCover} aria-label="Buka foto sampul">
              <Photo key={cover.id} url={cover.imageUrl} width={800} alt="Foto sampul" />
            </button>
          ) : (
            <div className={`arch arch-empty ${loading ? "shimmer" : ""}`} />
          )}
        </div>
      </header>

      <Extras letter={letter} />

      <main>
        {!loading && images.length > 0 && (
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={filter === "all"}
              className={filter === "all" ? "is-on" : ""} onClick={() => setFilter("all")}>
              Semua <span>{images.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={filter === "fav"}
              className={filter === "fav" ? "is-on" : ""} onClick={() => setFilter("fav")}>
              Favorit <span>{favCount}</span>
            </button>
            <span className="tabs-tools">
              <button type="button" onClick={startSlideshow} disabled={!visible.length}>Slideshow</button>
              <button type="button" className={selecting ? "is-on" : ""}
                onClick={() => { setSelecting((v) => !v); setSelectedIds([]); }}>
                {selecting ? "Selesai" : "Pilih"}
              </button>
            </span>
          </div>
        )}
        {loading ? (
          <div className="grid" aria-busy="true">
            {SKELETON_RATIOS.map((r, i) => (
              <div key={i} className="tile skeleton shimmer" style={{ aspectRatio: `1 / ${r}` }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <h2>{filter === "fav" ? "Belum ada favorit" : "Belum ada foto"}</h2>
            <p>{filter === "fav" ? "Ketuk ikon hati di foto untuk menandainya." : "Tekan “Tambah foto” untuk mengunggah foto pertama."}</p>
          </div>
        ) : (
          <div className={`grid ${selecting ? "is-selecting" : ""}`}>
            {visible.map((img, i) => (
              <GalleryItem key={img.id} img={img} index={i} onOpen={setViewIndex} onDelete={handleDelete}
                selecting={selecting} selected={selectedIds.includes(img.id)} onToggle={toggleSelect} />
            ))}
          </div>
        )}
      </main>

      {current && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Penampil foto"
          onClick={close} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button type="button" className="lb-btn lb-close" aria-label="Tutup" onClick={close}>
            <Icon name="close" size={22} />
          </button>
          <button type="button" className="lb-btn lb-play" aria-label={playing ? "Jeda slideshow" : "Putar slideshow"}
            onClick={(e) => { e.stopPropagation(); setPlaying((p) => !p); }}>
            <Icon name={playing ? "pause" : "play"} size={20} />
          </button>
          {visible.length > 1 && (
            <>
              <button type="button" className="lb-btn lb-prev" aria-label="Foto sebelumnya"
                onClick={(e) => { e.stopPropagation(); prev(); }}><Icon name="prev" size={22} /></button>
              <button type="button" className="lb-btn lb-next" aria-label="Foto berikutnya"
                onClick={(e) => { e.stopPropagation(); next(); }}><Icon name="next" size={22} /></button>
            </>
          )}

          <div className="lb-stage">
            <Photo key={current.id} url={current.imageUrl} width={1600}
              alt={`Foto ${viewIndex + 1} dari ${visible.length}`} className="lb-img"
              onClick={onPhotoTap} />
            {burst && <span className="lb-burst"><Icon name="heart" size={96} fill="currentColor" /></span>}
          </div>

          <div className="lb-panel" onClick={(e) => e.stopPropagation()}>
            {editing ? (
              <div className="cap-edit">
                <textarea value={draft} maxLength={200} rows={2} autoFocus
                  placeholder="Tulis keterangan foto ini…" onChange={(e) => setDraft(e.target.value)} />
                <div className="cap-actions">
                  <button type="button" onClick={() => setEditingId(null)}>Batal</button>
                  <button type="button" className="is-primary" onClick={saveCaption}>Simpan</button>
                </div>
              </div>
            ) : (
              <p className="caption">
                {current.caption ? current.caption : <span className="caption-empty">Belum ada keterangan</span>}
                <button type="button" className="cap-pencil" aria-label="Ubah keterangan" onClick={startEdit}>
                  <Icon name="pencil" size={15} />
                </button>
              </p>
            )}
            <div className="lb-actions">
              <button type="button" className={current.favorite ? "is-on" : ""} aria-label="Favorit" onClick={toggleFav}>
                <Icon name="heart" fill={current.favorite ? "currentColor" : "none"} />
              </button>
              <button type="button" aria-label="Jadikan sampul" className={cover?.id === current.id ? "is-on" : ""} onClick={makeCover}>
                <Icon name="cover" />
              </button>
              <button type="button" aria-label="Unduh" onClick={handleDownload}><Icon name="download" /></button>
              <button type="button" aria-label="Bagikan" onClick={handleShare}><Icon name="share" /></button>
            </div>
          </div>
          <div className="lb-counter">{viewIndex + 1} / {visible.length}</div>
        </div>
      )}

      {selecting && (
        <div className="selbar">
          <span>{zip ? `Menyiapkan ${zip.done}/${zip.total}…` : `${selectedIds.length} dipilih`}</span>
          <button type="button" onClick={() => setSelectedIds(visible.map((i) => i.id))}>Semua</button>
          <button type="button" className="is-primary" disabled={!selectedIds.length || !!zip} onClick={downloadZip}>
            Unduh ZIP
          </button>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default function App() {
  const isAdmin = new URLSearchParams(window.location.search).has("admin");
  return isAdmin ? <Admin /> : <Gallery />;
}
