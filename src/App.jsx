import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import imageCompression from "browser-image-compression";
import "./App.css";

function App() {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedImg, setSelectedImg] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  // Fungsi Play/Pause Musik
  const toggleMusic = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedImages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setImages(fetchedImages);
    });
    return () => unsubscribe();
  }, []);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1080, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);
        
        const formData = new FormData();
        formData.append("image", compressedFile);
        const imgbbApiKey = "d2975f87630c09664c72c8f0347931c4"; 
        
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error("Gagal upload ke ImgBB");

        await addDoc(collection(db, "gallery"), {
          imageUrl: data.data.url,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      alert("Ada foto yang gagal terunggah. Coba lagi ya!");
    }
    setUploading(false);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    const confirmDelete = window.confirm("Yakin mau hapus kenangan ini? 🥺");
    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, "gallery", id));
      } catch (error) {
        alert("Gagal menghapus foto nih.");
      }
    }
  };

  return (
    <div className="app-container">
      {/* Tombol Pemutar Musik Melayang */}
      <button className={`music-player ${isPlaying ? 'playing' : ''}`} onClick={toggleMusic}>
        {isPlaying ? '🎵 Musik On' : '🔇 Play Musik'}
        {/* Menggunakan lagu lofi romantis bebas hak cipta sebagai contoh */}
        <audio ref={audioRef} loop src="https://cdn.pixabay.com/download/audio/2022/05/16/audio_1808fbf07a.mp3" hidden />
      </button>

      <div className="glass-header">
        <h1>🎓 Wisuda Lala ✨</h1>
        
        {/* Kartu Ucapan Manis */}
        <div className="greeting-card">
          <p>
            "Selamat wisuda, Sayang! 💖 Segala lelah, revisian, dan perjuanganmu akhirnya terbayar lunas. 
            Aku bangga banget sama kamu. Website ini khusus buat nyimpen semua kenangan manis kita di hari spesialmu."
          </p>
        </div>
        
        <label className="upload-btn">
          {uploading ? "Menyimpan memori... ⏳" : "📸 Tambah Foto"}
          <input type="file" accept="image/*" multiple onChange={handleUpload} hidden disabled={uploading} />
        </label>
      </div>

      <div className="masonry-grid">
        {images.map((img) => (
          <div key={img.id} className="masonry-item" onClick={() => setSelectedImg(img.imageUrl)}>
            <img src={img.imageUrl} alt="Kenangan" loading="lazy" />
            <button className="delete-btn" onClick={(e) => handleDelete(img.id, e)}>🗑️</button>
          </div>
        ))}
      </div>

      {selectedImg && (
        <div className="lightbox" onClick={() => setSelectedImg(null)}>
          <span className="close-btn">&times;</span>
          <img src={selectedImg} alt="Zoomed" className="lightbox-img" />
        </div>
      )}

      {/* Footer Romantis */}
      <footer className="footer">
        Dibuat dengan seluruh 💖 untuk Lala
      </footer>
    </div>
  );
}

export default App;