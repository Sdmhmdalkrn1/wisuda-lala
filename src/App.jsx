import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import imageCompression from "browser-image-compression";
import "./App.css";

function App() {
  const [photos, setPhotos] = useState([]);
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Mengambil data dari Firestore secara realtime
  useEffect(() => {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPhotos(data);
    });
    return () => unsubscribe();
  }, []);

// Logika kompresi dan upload via ImgBB
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!image) return alert("Pilih fotonya dulu ya sayang! 💖");

    setLoading(true);
    try {
      // 1. Kompresi gambar
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1080, useWebWorker: true };
      const compressedFile = await imageCompression(image, options);

      // 2. Upload ke ImgBB
      const formData = new FormData();
      formData.append("image", compressedFile);
      
      // GANTI STRING DI BAWAH DENGAN API KEY IMGBB MILIKMU
      const imgbbApiKey = "d2975f87630c09664c72c8f0347931c4"; 
      
      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, {
        method: "POST",
        body: formData,
      });
      const imgbbData = await imgbbRes.json();
      
      if (!imgbbRes.ok) throw new Error("Gagal upload ke ImgBB");
      const url = imgbbData.data.url;

      // 3. Simpan link dari ImgBB dan teks pesan ke database Firestore
      await addDoc(collection(db, "gallery"), {
        imageUrl: url,
        message: message,
        createdAt: serverTimestamp(),
      });

      setImage(null);
      setMessage("");
      alert("Foto kenangan berhasil ditambahkan! ✨");
    } catch (error) {
      console.error("Error uploading: ", error);
      alert("Gagal upload nih, coba lagi ya!");
    }
    setLoading(false);
  };

  return (
    <div className="container">
      <header className="hero">
        <div className="decorations">✨ 🎓 ✨</div>
        <h1>Happy Graduation, Lala! 💖</h1>
        <p className="subtitle">
          Selamat atas gelar barumu, cantik! Perjalanan panjang, revisi, dan begadang kamu akhirnya terbayar lunas. Aku bangga banget sama kamu. Ini ada sedikit ruang kecil untuk menyimpan kenangan kita di hari spesialmu ini.
        </p>
      </header>

      <section className="upload-section">
        <h2>Tambah Kenangan Kita 📸</h2>
        <form onSubmit={handleUpload} className="upload-form">
          <input 
            type="file" 
            accept="image/*" 
            onChange={(e) => setImage(e.target.files[0])} 
            className="file-input"
          />
          <textarea 
            placeholder="Tulis pesan manis buat foto ini..." 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows="3"
            required
          />
          <button type="submit" disabled={loading} className="btn-upload">
            {loading ? "Menyimpan cintaku... ⏳" : "Upload Kenangan 💌"}
          </button>
        </form>
      </section>

      <section className="gallery-section">
        <h2>Galeri Wisuda Lala 🎓✨</h2>
        <div className="gallery-grid">
          {photos.length === 0 ? (
            <p className="empty-state">Belum ada foto nih, ayo upload momen pertama kita! 🥺</p>
          ) : (
            photos.map((photo) => (
              <div key={photo.id} className="card">
                <img src={photo.imageUrl} alt="Kenangan Lala" loading="lazy" />
                {photo.message && <div className="card-message">{photo.message}</div>}
              </div>
            ))
          )}
        </div>
      </section>

      <footer>
        <p>Dibuat dengan segenap 💖 untuk Lala.</p>
        <p className="date">Oktober 2026</p>
      </footer>
    </div>
  );
}

export default App;