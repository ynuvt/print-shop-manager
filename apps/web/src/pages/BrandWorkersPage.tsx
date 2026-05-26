import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Phone, Plus, X, Edit2, Trash2, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import { getWorkers, createWorker, updateWorker, deleteWorker } from "../api/brandApi";

interface Worker { id: string; phoneNumber: string; name: string; isActive: boolean; _count: { redemptions: number }; }
interface OutletInfo { name: string; outletCode: string; }

export default function BrandWorkersPage() {
  const { outletId } = useParams<{ outletId: string }>();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [outlet, setOutlet] = useState<OutletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phoneNumber: "" });

  const load = () => {
    if (!outletId) return;
    getWorkers(outletId).then((d) => { setWorkers(d.workers); setOutlet(d.outlet); }).finally(() => setLoading(false));
  };
  useEffect(load, [outletId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const phone = form.phoneNumber.startsWith("91") ? form.phoneNumber : `91${form.phoneNumber}`;
      if (editId) { await updateWorker(editId, { name: form.name, phoneNumber: phone }); toast.success("Worker updated!"); }
      else { await createWorker(outletId!, { name: form.name, phoneNumber: phone }); toast.success("Worker added!"); }
      setModalOpen(false); load();
    } catch (err: any) { toast.error(err?.response?.data?.message || "Failed"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this worker?")) return;
    try { await deleteWorker(id); toast.success("Worker deactivated"); load(); }
    catch { toast.error("Failed"); }
  };

  if (loading) {
    return (
      <div style={{ animation: "pulse 2s ease-in-out infinite" }}>
        <div className="brand-skeleton" style={{ height: 32, width: 160, marginBottom: 24 }} />
        <div className="brand-gap-3">{[...Array(3)].map((_, i) => <div key={i} className="brand-skeleton" style={{ height: 64 }} />)}</div>
      </div>
    );
  }

  return (
    <div className="brand-gap-6">
      <div className="brand-workers-header">
        <button onClick={() => navigate("/brand/outlets")} className="brand-back-btn"><ArrowLeft size={16} /></button>
        <div style={{ flex: 1 }}>
          <h1 className="brand-page-title">Workers</h1>
          <p className="brand-page-subtitle">{outlet?.name} · <span style={{ fontFamily: "monospace" }}>{outlet?.outletCode}</span></p>
        </div>
        <button onClick={() => { setEditId(null); setForm({ name: "", phoneNumber: "" }); setModalOpen(true); }} className="brand-btn-primary">
          <Plus size={16} /> Add Worker
        </button>
      </div>

      <div className="brand-gap-3">
        {workers.map((w, i) => (
          <motion.div key={w.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
            className={`brand-worker-item ${!w.isActive ? "inactive" : ""}`}
          >
            <div className="brand-worker-avatar"><UserCheck size={16} color="#34d399" /></div>
            <div className="brand-worker-info">
              <p className="brand-worker-name">{w.name}</p>
              <div className="brand-worker-phone"><Phone size={12} /> +{w.phoneNumber}</div>
            </div>
            <div className="brand-worker-stat">
              <p className="brand-worker-stat-value">{w._count.redemptions}</p>
              <p className="brand-worker-stat-label">redemptions</p>
            </div>
            <div className="brand-actions-row">
              <button onClick={() => { setEditId(w.id); setForm({ name: w.name, phoneNumber: w.phoneNumber }); setModalOpen(true); }} className="brand-btn-icon"><Edit2 size={14} /></button>
              <button onClick={() => handleDelete(w.id)} className="brand-btn-icon danger"><Trash2 size={14} /></button>
            </div>
          </motion.div>
        ))}
        {workers.length === 0 && <div style={{ textAlign: "center", padding: "64px 0", color: "#52525b" }}>No workers yet. Add your first worker.</div>}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="brand-modal-overlay" onClick={() => setModalOpen(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="brand-modal" style={{ maxWidth: 384 }} onClick={(e) => e.stopPropagation()}>
              <div className="brand-modal-header"><h3 className="brand-modal-title">{editId ? "Edit" : "Add"} Worker</h3><button onClick={() => setModalOpen(false)} className="brand-modal-close"><X size={16} /></button></div>
              <form onSubmit={handleSave} className="brand-gap-4">
                <div className="brand-form-group"><label className="brand-label">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Worker's name" className="brand-input" /></div>
                <div className="brand-form-group">
                  <label className="brand-label">Phone Number</label>
                  <div className="brand-phone-input-group">
                    <span className="brand-phone-prefix">+91</span>
                    <input value={form.phoneNumber.replace(/^91/, "")} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value.replace(/\D/g, "") })} required placeholder="9876543210" className="brand-phone-input" />
                  </div>
                </div>
                <button type="submit" className="brand-btn-primary" style={{ width: "100%", justifyContent: "center" }}>{editId ? "Update" : "Add"} Worker</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
