import { useEffect, useState } from "react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ?? 
  (window.location.origin.includes("localhost") ? "http://localhost:4000" : window.location.origin)
).replace(/\/$/, "") + "/api/v1";

export default function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("zopy_admin_analytics_token")
  );
  
  // Login Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [startDate, setStartDate] = useState("2026-04-29");
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedShop, setSelectedShop] = useState<string>("all");

  const [summary, setSummary] = useState<any>(null);
  const [users, setUsers] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [shopsData, setShopsData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "shops" | "simulator">("dashboard");

  // Revenue Simulator state
  const [simFileThreshold, setSimFileThreshold] = useState(5);   // charge per N files
  const [simFeePerBatch, setSimFeePerBatch] = useState(1);        // ₹ per batch of N files
  const [simFlatPerJob, setSimFlatPerJob] = useState(5);          // ₹ flat fee per job
  const [simGatewayCut, setSimGatewayCut] = useState(2);          // % gateway takes
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Shop creation form state
  const [newShopUsername, setNewShopUsername] = useState("");
  const [newShopPassword, setNewShopPassword] = useState("");
  const [newShopId, setNewShopId] = useState("");
  const [newShopName, setNewShopName] = useState("");
  const [newShopLandmark, setNewShopLandmark] = useState("");
  const [newShopImageUrl, setNewShopImageUrl] = useState("");
  const [newShopLatitude, setNewShopLatitude] = useState<string>("");
  const [newShopLongitude, setNewShopLongitude] = useState<string>("");
  const [newShopPriceBW, setNewShopPriceBW] = useState(2);
  const [newShopPriceColor, setNewShopPriceColor] = useState(7);
  const [newShopUpiId, setNewShopUpiId] = useState("");
  const [newShopDuplexRateApplicable, setNewShopDuplexRateApplicable] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");
  const [createError, setCreateError] = useState("");

  // Editing Shop state
  const [editingShop, setEditingShop] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editLandmark, setEditLandmark] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editLatitude, setEditLatitude] = useState<string>("");
  const [editLongitude, setEditLongitude] = useState<string>("");
  const [editPriceBW, setEditPriceBW] = useState(2);
  const [editPriceColor, setEditPriceColor] = useState(7);
  const [editUpiId, setEditUpiId] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPlatformChargeEnabled, setEditPlatformChargeEnabled] = useState(false);
  const [editDuplexRateApplicable, setEditDuplexRateApplicable] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  // Mark Payment state
  const [markPaymentShop, setMarkPaymentShop] = useState<any>(null);
  const [markPaymentAmount, setMarkPaymentAmount] = useState("");
  const [markPaymentNote, setMarkPaymentNote] = useState("");
  const [markPaymentLoading, setMarkPaymentLoading] = useState(false);
  const [markPaymentError, setMarkPaymentError] = useState("");
  const [markPaymentSuccess, setMarkPaymentSuccess] = useState("");

  // Uploading state
  const [uploadingNew, setUploadingNew] = useState(false);
  const [uploadingEdit, setUploadingEdit] = useState(false);

  const handleImageUpload = async (file: File, isEdit: boolean) => {
    const setUploading = isEdit ? setUploadingEdit : setUploadingNew;
    const setImageUrl = isEdit ? setEditImageUrl : setNewShopImageUrl;
    const setError = isEdit ? setEditError : setCreateError;

    setUploading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/analysis/presign-upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to get upload URL.");
      }

      const { uploadUrl, publicUrl } = await res.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload image file to R2.");
      }

      setImageUrl(publicUrl);
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error("Invalid credentials or unauthorized.");
      }

      const data = await res.json();
      if (data.token) {
        const tokenString = typeof data.token === "object" && data.token !== null && "token" in data.token
          ? (data.token as any).token
          : data.token;
        localStorage.setItem("zopy_admin_analytics_token", tokenString);
        setToken(tokenString);
      } else {
        throw new Error("Invalid login response.");
      }
    } catch (err: any) {
      setLoginError(err.message || "Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("zopy_admin_analytics_token");
    setToken(null);
    setSummary(null);
    setUsers(null);
    setInsights(null);
    setShopsData(null);
  };

  const fetchAnalytics = async (currentToken: string) => {
    setLoading(true);
    setError("");
    try {
      const query = `?startDate=${startDate}&endDate=${endDate}`;
      const shopQuery = `${query}&shopId=${selectedShop}`;
      const headers = {
        "Authorization": `Bearer ${currentToken}`,
        "Content-Type": "application/json",
      };

      const [sumRes, usrRes, insRes, shpRes] = await Promise.all([
        fetch(`${API_BASE}/analysis/summary${shopQuery}`, { headers }),
        fetch(`${API_BASE}/analysis/users${shopQuery}`, { headers }),
        fetch(`${API_BASE}/analysis/insights${shopQuery}`, { headers }),
        fetch(`${API_BASE}/analysis/shops${query}`, { headers }),
      ]);

      if (sumRes.status === 401 || usrRes.status === 401 || insRes.status === 401 || shpRes.status === 401) {
        handleLogout();
        throw new Error("Session expired. Please log in again.");
      }

      if (!sumRes.ok || !usrRes.ok || !insRes.ok || !shpRes.ok) {
        throw new Error("Failed to fetch analytics data");
      }

      setSummary(await sumRes.json());
      setUsers(await usrRes.json());
      setInsights(await insRes.json());
      setShopsData(await shpRes.json());
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShopUsername.trim() || !newShopPassword.trim() || !newShopId.trim()) {
      setCreateError("Username, Password, and Shop ID are required.");
      return;
    }
    setCreateLoading(true);
    setCreateError("");
    setCreateSuccess("");
    try {
      const res = await fetch(`${API_BASE}/analysis/shops`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: newShopUsername.trim(),
          password: newShopPassword.trim(),
          shopId: newShopId.trim().toUpperCase(),
          name: newShopName.trim(),
          landmark: newShopLandmark.trim() || null,
          imageUrl: newShopImageUrl.trim() || null,
          latitude: newShopLatitude ? Number(newShopLatitude) : null,
          longitude: newShopLongitude ? Number(newShopLongitude) : null,
          priceBW: Number(newShopPriceBW),
          priceColor: Number(newShopPriceColor),
          upiId: newShopUpiId.trim() || null,
          duplexRateApplicable: newShopDuplexRateApplicable,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create shop.");
      }

      setCreateSuccess(`Shop "${data.username}" created successfully!`);
      setNewShopUsername("");
      setNewShopPassword("");
      setNewShopId("");
      setNewShopName("");
      setNewShopLandmark("");
      setNewShopImageUrl("");
      setNewShopLatitude("");
      setNewShopLongitude("");
      setNewShopPriceBW(2);
      setNewShopPriceColor(7);
      setNewShopUpiId("");
      setNewShopDuplexRateApplicable(true);
      if (token) fetchAnalytics(token);
    } catch (err: any) {
      setCreateError(err.message || "Something went wrong.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShop) return;
    
    setEditLoading(true);
    setEditError("");
    setEditSuccess("");
    try {
      const res = await fetch(`${API_BASE}/analysis/shops/${editingShop.shopId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName.trim(),
          landmark: editLandmark.trim() || null,
          imageUrl: editImageUrl.trim() || null,
          latitude: editLatitude ? Number(editLatitude) : null,
          longitude: editLongitude ? Number(editLongitude) : null,
          priceBW: Number(editPriceBW),
          priceColor: Number(editPriceColor),
          upiId: editUpiId.trim() || null,
          isActive: editIsActive,
          platformChargeEnabled: editPlatformChargeEnabled,
          duplexRateApplicable: editDuplexRateApplicable,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update shop.");
      }

      setEditSuccess(`Shop "${data.username}" updated successfully!`);
      if (token) fetchAnalytics(token);
      setTimeout(() => {
        setEditingShop(null);
        setEditSuccess("");
      }, 1000);
    } catch (err: any) {
      setEditError(err.message || "Something went wrong.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleMarkPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markPaymentShop) return;
    const amount = parseFloat(markPaymentAmount);
    if (!amount || amount <= 0) {
      setMarkPaymentError("Enter a valid positive amount.");
      return;
    }
    setMarkPaymentLoading(true);
    setMarkPaymentError("");
    setMarkPaymentSuccess("");
    try {
      const res = await fetch(`${API_BASE}/analysis/shops/${markPaymentShop.shopId}/mark-payment`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: markPaymentNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record payment.");
      setMarkPaymentSuccess(`Payment of ₹${amount} recorded!`);
      setMarkPaymentAmount("");
      setMarkPaymentNote("");
      if (token) fetchAnalytics(token);
      setTimeout(() => { setMarkPaymentShop(null); setMarkPaymentSuccess(""); }, 1500);
    } catch (err: any) {
      setMarkPaymentError(err.message || "Something went wrong.");
    } finally {
      setMarkPaymentLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAnalytics(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedShop]);

  // Render Login Page if token is missing
  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-950 p-4 font-sans text-gray-100">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="text-center">
            <img src={`${import.meta.env.BASE_URL}zopy.png`} alt="Zopy" className="mx-auto h-14 w-14 rounded-2xl shadow-lg mb-4" />
            <h1 className="text-2xl font-bold tracking-tight text-white">Zopy Admin Analytics</h1>
            <p className="text-sm text-gray-400 mt-1">Sign in with your admin credentials</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {loginError && (
              <div className="bg-red-950/50 border border-red-900/50 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold py-3 px-4 rounded-xl text-sm transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginLoading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  const peakHoursMax = insights?.peakHours ? Math.max(...insights.peakHours, 1) : 1;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Header Section */}
        <header className="flex flex-col gap-4 md:flex-row justify-between items-start md:items-center pb-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}zopy.png`} alt="Zopy" className="w-9 h-9 rounded-xl shadow-md" />
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Analytics
              </h1>
            </div>
            <p className="text-gray-400 text-xs sm:text-sm mt-1.5">
              Data strictly from April 29, 2026 onwards · Local IST Timezone
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5">
              <span className="text-xs text-gray-400">Shop:</span>
              <select
                value={selectedShop}
                onChange={(e) => setSelectedShop(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none border-none p-0 cursor-pointer"
              >
                <option value="all" className="bg-gray-900 text-white">All Shops</option>
                {shopsData?.shops?.map((shop: any) => (
                  <option key={shop.id} value={shop.shopId} className="bg-gray-900 text-white">
                    {shop.username} ({shop.shopId})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5">
              <span className="text-xs text-gray-400">From:</span>
              <input
                type="date"
                min="2026-04-29"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none border-none p-0 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5">
              <span className="text-xs text-gray-400">To:</span>
              <input
                type="date"
                min="2026-04-29"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none border-none p-0 cursor-pointer"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => fetchAnalytics(token)}
                disabled={loading}
                className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-600 text-gray-950 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 active:scale-95"
              >
                {loading ? "Loading..." : "Filter"}
              </button>
              <button
                onClick={handleLogout}
                className="border border-gray-800 hover:bg-gray-900 text-gray-400 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        {token && !error && (
          <div className="flex border-b border-gray-800 gap-6 mt-4">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`pb-3 text-sm font-bold transition-all relative ${
                activeTab === "dashboard" ? "text-amber-500 font-extrabold" : "text-gray-400 hover:text-white"
              }`}
            >
              Dashboard
              {activeTab === "dashboard" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("shops")}
              className={`pb-3 text-sm font-bold transition-all relative ${
                activeTab === "shops" ? "text-amber-500 font-extrabold" : "text-gray-400 hover:text-white"
              }`}
            >
              Shops &amp; Printshops
              {activeTab === "shops" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("simulator")}
              className={`pb-3 text-sm font-bold transition-all relative ${
                activeTab === "simulator" ? "text-violet-400 font-extrabold" : "text-gray-400 hover:text-white"
              }`}
            >
              Revenue Simulator
              {activeTab === "simulator" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 rounded-full" />
              )}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-950/30 border border-red-900/50 text-red-400 p-4 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {!loading && summary && users && insights && activeTab === "dashboard" && (
          <div className="space-y-6 sm:space-y-8">
            
            {/* Key Metrics Cards */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CardMetric label="Revenue" value={`₹${summary.summary.totalRevenue.toLocaleString()}`} color="text-amber-500" />
              <CardMetric label="Completed Jobs" value={summary.summary.totalCompletedJobs} color="text-blue-400" />
              <CardMetric label="Pages Printed" value={summary.summary.totalPages} color="text-emerald-400" />
              <CardMetric label="Conversion" value={`${(summary.funnel.overallConversion * 100).toFixed(1)}%`} color="text-indigo-400" />
            </section>

            {/* Detailed Metrics Sections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              
              {/* Column 1: Financial & Operations */}
              <section className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden p-6 space-y-4">
                <h3 className="text-lg font-bold text-white border-b border-gray-800 pb-3 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
                  Financial &amp; Operations
                </h3>
                <div className="space-y-4 divide-y divide-gray-800/50">
                  <MetricRow label="Avg Order Value" value={`₹${summary.summary.avgOrderValue.toFixed(2)}`} desc="AOV per finished print" />
                  <MetricRow label="Avg Pages / Job" value={summary.summary.avgPagesPerJob.toFixed(1)} desc="Average sheet count per print" />
                  <MetricRow label="Web Orders" value={summary.sources.WEB?.count ?? 0} desc="Created from web client" />
                  <MetricRow label="WhatsApp Orders" value={summary.sources.WHATSAPP?.count ?? 0} desc="Created via WhatsApp webhook" />
                </div>
              </section>

              {/* Column 2: User Growth */}
              <section className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden p-6 space-y-4">
                <h3 className="text-lg font-bold text-white border-b border-gray-800 pb-3 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-blue-400 rounded-full"></span>
                  User Analytics
                </h3>
                <div className="space-y-4 divide-y divide-gray-800/50">
                  <MetricRow label="New Users" value={users.acquisition.totalNewUsers} desc="Acquired in filter window" />
                  <MetricRow label="Active Users" value={users.acquisition.totalActiveUsers} desc="Users printing in period" />
                  <MetricRow label="Repeat Customers" value={users.retention.repeatCustomers} desc="Ordered 2 or more times" />
                  <MetricRow label="Activation Rate" value={`${(users.acquisition.activationRate * 100).toFixed(1)}%`} desc="New users placing order" />
                </div>
              </section>

              {/* Column 3: Platform Insights */}
              <section className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden p-6 space-y-4">
                <h3 className="text-lg font-bold text-white border-b border-gray-800 pb-3 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full"></span>
                  Platform Insights
                </h3>
                <div className="space-y-4 divide-y divide-gray-800/50">
                  <MetricRow label="ARPU" value={`₹${insights.arpu}`} desc="Average Revenue Per User" />
                  <MetricRow label="Churn Rate" value={`${insights.churnRate}%`} desc="Inactive for > 30 days" />
                  <MetricRow label="WhatsApp Linked" value={summary.whatsapp.syncedUsers} desc="Accounts synced to WhatsApp" />
                  <MetricRow label="WA OTP Success" value={`${(summary.whatsapp.otpSuccessRate * 100).toFixed(1)}%`} desc="Login code completion rate" />
                </div>
              </section>

            </div>

            {/* Peak Hours Visual Bar Chart */}
            <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Peak Printing Hours (IST)</h3>
                <p className="text-xs text-gray-400 mt-1">Hourly distribution of completed prints. Swipe horizontally to view full day.</p>
              </div>

              {/* Scrollable Bar Plot */}
              <div className="flex items-end gap-2.5 overflow-x-auto pb-4 pt-8 px-2 scrollbar-thin select-none" style={{ height: "200px" }}>
                {insights.peakHours.map((val: number, i: number) => {
                  const pct = Math.max(2, Math.round((val / peakHoursMax) * 100));
                  return (
                    <div key={i} className="flex flex-col items-center gap-2 group shrink-0 w-8">
                      {/* Count tooltip */}
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gray-800 text-[10px] text-white py-0.5 px-1.5 rounded font-mono font-bold mb-1 -translate-y-2 pointer-events-none">
                        {val}
                      </span>
                      {/* Bar */}
                      <div 
                        className="w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-md transition-all duration-500 hover:from-amber-400 hover:to-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                        style={{ height: `${pct}px` }}
                      />
                      {/* Label */}
                      <span className="text-[10px] font-mono text-gray-400 font-medium">
                        {i.toString().padStart(2, "0")}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

          </div>
        )}

        {activeTab === "simulator" && summary && insights && (
          <RevenueSimulator
            summary={summary}
            insights={insights}
            simFileThreshold={simFileThreshold}
            setSimFileThreshold={setSimFileThreshold}
            simFeePerBatch={simFeePerBatch}
            setSimFeePerBatch={setSimFeePerBatch}
            simFlatPerJob={simFlatPerJob}
            setSimFlatPerJob={setSimFlatPerJob}
            simGatewayCut={simGatewayCut}
            setSimGatewayCut={setSimGatewayCut}
            startDate={startDate}
            endDate={endDate}
          />
        )}

        {activeTab === "shops" && !loading && shopsData && (
          <div className="space-y-6 sm:space-y-8">
            {/* Shop Metric Cards */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <CardMetric
                label="Total Shops"
                value={shopsData.shops.length}
                color="text-amber-500"
              />
              <CardMetric
                label="Active Shops"
                value={shopsData.shops.filter((s: any) => s.isActive).length}
                color="text-emerald-400"
              />
              <CardMetric
                label="Top Printing Shop"
                value={shopsData.shops[0] ? `${shopsData.shops[0].username} (${shopsData.shops[0].completedJobsCount} jobs)` : "None"}
                color="text-indigo-400"
              />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              {/* Leaderboard Column (2/3 width on desktop) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Shop Leaderboard card */}
                <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
                      Shop Printing Leaderboard
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">Shops ranked by completed printing jobs in the selected period.</p>
                  </div>

                  <div className="space-y-4 pt-2">
                    {shopsData.shops.length === 0 ? (
                      <p className="text-sm text-gray-500 py-6 text-center">No shops found. Use the form on the right to create one.</p>
                    ) : (
                      shopsData.shops.map((shop: any, i: number) => {
                        const maxJobs = shopsData.shops[0]?.completedJobsCount || 1;
                        const pct = Math.max(3, Math.round((shop.completedJobsCount / maxJobs) * 100));
                        return (
                          <div key={shop.id} className="space-y-2">
                            <div className="flex justify-between items-center text-sm font-semibold">
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${
                                  i === 0 ? "bg-amber-500 text-black" : "bg-gray-800 text-gray-400"
                                }`}>
                                  {i + 1}
                                </span>
                                <span className="text-gray-200">{shop.username}</span>
                                <span className="text-xs text-gray-500 font-mono">({shop.shopId})</span>
                              </div>
                              <span className="text-white font-mono">{shop.completedJobsCount} jobs</span>
                            </div>
                            <div className="w-full bg-gray-950 h-3 rounded-full overflow-hidden border border-gray-800/50">
                              <div
                                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                              <span>Pages: {shop.totalPagesPrinted}</span>
                              <span>Revenue: ₹{shop.totalRevenue}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Detailed Shops List card */}
                <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-blue-400 rounded-full"></span>
                    Detailed Shop Performance
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 text-gray-400 text-xs font-semibold uppercase tracking-wider">
                          <th className="pb-3 pr-2">Username / Shop ID</th>
                          <th className="pb-3 px-2">Name / Landmark</th>
                          <th className="pb-3 px-2 text-right">Pricing (B&W / Color)</th>
                          <th className="pb-3 px-2 text-right">Jobs</th>
                          <th className="pb-3 px-2 text-right">Pages</th>
                          <th className="pb-3 px-2 text-right">Revenue</th>
                          <th className="pb-3 px-2 text-right">Payable</th>
                          <th className="pb-3 pl-2 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {shopsData.shops.map((shop: any) => (
                          <tr key={shop.id} className={`hover:bg-gray-800/10 transition-colors ${!shop.isActive ? "opacity-50" : ""}`}>
                            <td className="py-3.5 pr-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${shop.isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500"}`} title={shop.isActive ? "Active" : "Inactive"}></span>
                                <p className="font-bold text-white">{shop.username}</p>
                              </div>
                              <p className="text-xs text-gray-500 font-mono mt-0.5 ml-4">{shop.shopId}</p>
                            </td>
                            <td className="py-3.5 px-2">
                              <p className="text-sm font-semibold text-gray-200">{shop.name || "—"}</p>
                              {shop.landmark && (
                                <p className="text-xs text-gray-400 italic mt-0.5 flex items-center gap-1">
                                  📍 {shop.landmark}
                                </p>
                              )}
                            </td>
                            <td className="py-3.5 px-2 text-right font-mono text-gray-300">
                              <p>₹{shop.priceBW} / ₹{shop.priceColor}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">Duplex Discount: {shop.duplexRateApplicable ? "Yes" : "No"}</p>
                            </td>
                            <td className="py-3.5 px-2 text-right font-mono text-gray-300">{shop.completedJobsCount}</td>
                            <td className="py-3.5 px-2 text-right font-mono text-gray-300">{shop.totalPagesPrinted}</td>
                            <td className="py-3.5 px-2 text-right font-mono text-amber-500 font-bold">₹{shop.totalRevenue}</td>
                            <td className="py-3.5 px-2 text-right">
                              {shop.platformChargeEnabled ? (
                                <span className="font-mono font-bold text-violet-400">₹{shop.platformPayable ?? 0}</span>
                              ) : (
                                <span className="text-gray-600 text-xs">off</span>
                              )}
                            </td>
                            <td className="py-3.5 pl-2 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {shop.platformChargeEnabled && (shop.platformPayable ?? 0) > 0 && (
                                <button
                                  onClick={() => {
                                    setMarkPaymentShop(shop);
                                    setMarkPaymentAmount(String(shop.platformPayable ?? ""));
                                    setMarkPaymentNote("");
                                    setMarkPaymentError("");
                                    setMarkPaymentSuccess("");
                                  }}
                                  className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold py-1 px-2 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer active:scale-95"
                                >
                                  Mark Paid
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingShop(shop);
                                  setEditName(shop.name || "");
                                  setEditLandmark(shop.landmark || "");
                                  setEditImageUrl(shop.imageUrl || "");
                                  setEditLatitude(shop.latitude?.toString() || "");
                                  setEditLongitude(shop.longitude?.toString() || "");
                                  setEditPriceBW(shop.priceBW ?? 2);
                                  setEditPriceColor(shop.priceColor ?? 7);
                                  setEditUpiId(shop.upiId || "");
                                  setEditIsActive(shop.isActive);
                                  setEditPlatformChargeEnabled(shop.platformChargeEnabled ?? false);
                                  setEditDuplexRateApplicable(shop.duplexRateApplicable ?? true);
                                  setEditError("");
                                  setEditSuccess("");
                                }}
                                className="bg-amber-500 hover:bg-amber-600 text-gray-950 text-xs font-bold py-1 px-2.5 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                Edit
                              </button>
                              {shop.imageUrl && (
                                <a
                                  href={shop.imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-bold py-1.5 px-2.5 rounded-lg transition-colors inline-flex items-center cursor-pointer active:scale-95 transition-all"
                                >
                                  Photo
                                </a>
                              )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              {/* Create Shop Form Column (1/3 width on desktop) */}
              <div>
                <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4 sticky top-6">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full"></span>
                      Create New Shop
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">Register a physical printshop location.</p>
                  </div>

                  <form onSubmit={handleCreateShop} className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                        Username
                      </label>
                      <input
                        type="text"
                        required
                        value={newShopUsername}
                        onChange={(e) => setNewShopUsername(e.target.value)}
                        placeholder="e.g. tcetharshad"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        value={newShopPassword}
                        onChange={(e) => setNewShopPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                        Shop ID / Code
                      </label>
                      <input
                        type="text"
                        required
                        value={newShopId}
                        onChange={(e) => setNewShopId(e.target.value)}
                        placeholder="e.g. 1"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono uppercase"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={newShopName}
                        onChange={(e) => setNewShopName(e.target.value)}
                        placeholder="e.g. TCET Harshad Shop"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                        Landmark
                      </label>
                      <input
                        type="text"
                        value={newShopLandmark}
                        onChange={(e) => setNewShopLandmark(e.target.value)}
                        placeholder="e.g. Near main canteen"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 font-sans">
                          Shop Image
                        </label>
                        {uploadingNew && (
                          <span className="text-[10px] text-amber-500 font-bold animate-pulse">
                            Uploading to R2...
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newShopImageUrl}
                            onChange={(e) => setNewShopImageUrl(e.target.value)}
                            placeholder="Image URL or upload file..."
                            className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                          />
                          <label className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-bold py-3 px-4 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 active:scale-95 transition-all">
                            Upload File
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImageUpload(file, false);
                              }}
                              disabled={uploadingNew}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                          Latitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={newShopLatitude}
                          onChange={(e) => setNewShopLatitude(e.target.value)}
                          placeholder="e.g. 19.2856"
                          className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                          Longitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={newShopLongitude}
                          onChange={(e) => setNewShopLongitude(e.target.value)}
                          placeholder="e.g. 72.8691"
                          className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                          B&W Price (₹)
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          required
                          value={newShopPriceBW}
                          onChange={(e) => setNewShopPriceBW(Number(e.target.value))}
                          className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                          Color Price (₹)
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          required
                          value={newShopPriceColor}
                          onChange={(e) => setNewShopPriceColor(Number(e.target.value))}
                          className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">UPI ID (optional)</label>
                      <input
                        type="text"
                        value={newShopUpiId}
                        onChange={(e) => setNewShopUpiId(e.target.value)}
                        placeholder="shopname@upi"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                      />
                      <p className="text-xs text-gray-600 mt-1">Used to generate Pay Now links for customers.</p>
                    </div>

                    <div className="flex items-center gap-3 bg-gray-950/30 border border-gray-800/80 rounded-2xl p-4">
                      <input
                        type="checkbox"
                        id="newShopDuplexRateApplicable"
                        checked={newShopDuplexRateApplicable}
                        onChange={(e) => setNewShopDuplexRateApplicable(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-800 text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer"
                      />
                      <div>
                        <label htmlFor="newShopDuplexRateApplicable" className="text-sm font-semibold text-gray-300 select-none cursor-pointer font-sans">
                          Duplex Discount Applicable
                        </label>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          If checked, B&W double-sided printing uses half the sheets. Otherwise it is billed per page.
                        </p>
                      </div>
                    </div>

                    {createError && (
                      <div className="bg-red-950/50 border border-red-900/50 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2 font-sans">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        {createError}
                      </div>
                    )}

                    {createSuccess && (
                      <div className="bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 text-xs p-3 rounded-lg flex items-center gap-2 font-sans font-semibold">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        {createSuccess}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={createLoading}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold py-3 px-4 rounded-xl text-sm transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-sans"
                    >
                      {createLoading ? "Registering Shop..." : "Register Shop"}
                    </button>
                  </form>
                </section>
              </div>
            </div>
          </div>
        )}
      {/* Edit Shop Modal */}
      {editingShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-6 relative animate-scale-in">
            <button
              onClick={() => setEditingShop(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-xl hover:bg-gray-800/50 transition-colors cursor-pointer"
              title="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
                Edit Shop Details
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Modify parameters for {editingShop.username} ({editingShop.shopId}).
              </p>
            </div>

            <form onSubmit={handleUpdateShop} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Shop ID (Read-only)
                  </span>
                  <div className="bg-gray-950/50 border border-gray-800/60 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-400">
                    {editingShop.shopId}
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Username (Read-only)
                  </span>
                  <div className="bg-gray-950/50 border border-gray-800/60 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-400">
                    {editingShop.username}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. TCET Harshad Shop"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                  Landmark
                </label>
                <input
                  type="text"
                  value={editLandmark}
                  onChange={(e) => setEditLandmark(e.target.value)}
                  placeholder="e.g. Near main canteen"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 font-sans">
                    Shop Image
                  </label>
                  {uploadingEdit && (
                    <span className="text-[10px] text-amber-500 font-bold animate-pulse">
                      Uploading to R2...
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editImageUrl}
                      onChange={(e) => setEditImageUrl(e.target.value)}
                      placeholder="Image URL or upload file..."
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-sans"
                    />
                    <label className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-bold py-3 px-4 rounded-xl transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 active:scale-95 transition-all">
                      Upload File
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, true);
                        }}
                        disabled={uploadingEdit}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editLatitude}
                    onChange={(e) => setEditLatitude(e.target.value)}
                    placeholder="e.g. 19.2856"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editLongitude}
                    onChange={(e) => setEditLongitude(e.target.value)}
                    placeholder="e.g. 72.8691"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                    B&W Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={editPriceBW}
                    onChange={(e) => setEditPriceBW(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                    Color Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={editPriceColor}
                    onChange={(e) => setEditPriceColor(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-sans">
                  UPI ID (optional)
                </label>
                <input
                  type="text"
                  value={editUpiId}
                  onChange={(e) => setEditUpiId(e.target.value)}
                  placeholder="shopname@upi"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                />
                <p className="text-xs text-gray-600 mt-1">Used to generate Pay Now links for customers.</p>
              </div>

              <div className="flex items-center gap-3 bg-gray-950/30 border border-gray-800/80 rounded-2xl p-4">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-800 text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer"
                />
                <label htmlFor="editIsActive" className="text-sm font-semibold text-gray-300 select-none cursor-pointer font-sans">
                  Is Active (Open for orders)
                </label>
              </div>

              <div className="flex items-center gap-3 bg-gray-950/30 border border-gray-800/80 rounded-2xl p-4">
                <input
                  type="checkbox"
                  id="editDuplexRateApplicable"
                  checked={editDuplexRateApplicable}
                  onChange={(e) => setEditDuplexRateApplicable(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-800 text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer"
                />
                <div>
                  <label htmlFor="editDuplexRateApplicable" className="text-sm font-semibold text-gray-300 select-none cursor-pointer font-sans">
                    Duplex Discount Applicable
                  </label>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    If checked, B&W double-sided printing uses half the sheets. Otherwise it is billed per page.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-violet-950/20 border border-violet-900/40 rounded-2xl p-4">
                <input
                  type="checkbox"
                  id="editPlatformChargeEnabled"
                  checked={editPlatformChargeEnabled}
                  onChange={(e) => setEditPlatformChargeEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-800 text-violet-500 focus:ring-violet-500 accent-violet-500 cursor-pointer"
                />
                <div>
                  <label htmlFor="editPlatformChargeEnabled" className="text-sm font-semibold text-gray-300 select-none cursor-pointer font-sans">
                    Platform Charge Enabled
                  </label>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Charge ₹2/job (above ₹20) or ₹4/job (above ₹100). Shop sees payable amount.
                  </p>
                </div>
              </div>

              {editError && (
                <div className="bg-red-950/50 border border-red-900/50 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2 font-sans">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {editError}
                </div>
              )}

              {editSuccess && (
                <div className="bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 text-xs p-3 rounded-lg flex items-center gap-2 font-semibold font-sans">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  {editSuccess}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingShop(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-400 hover:text-white border border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-all transform active:scale-95 disabled:opacity-50 cursor-pointer font-sans"
                >
                  {editLoading ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Payment Modal */}
      {markPaymentShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-6 relative">
            <button
              onClick={() => setMarkPaymentShop(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-xl hover:bg-gray-800/50 transition-colors cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-violet-500 rounded-full"></span>
                Mark Payment Received
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Record that Zopy has received the platform fee from <strong className="text-gray-300">{markPaymentShop.username}</strong> ({markPaymentShop.shopId}).
              </p>
            </div>

            <div className="bg-violet-950/20 border border-violet-900/40 rounded-2xl p-4 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Current Payable</span>
              <span className="text-2xl font-black text-violet-400">₹{markPaymentShop.platformPayable ?? 0}</span>
            </div>

            <form onSubmit={handleMarkPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Amount Received (₹)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={markPaymentAmount}
                  onChange={(e) => setMarkPaymentAmount(e.target.value)}
                  placeholder={String(markPaymentShop.platformPayable ?? "")}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={markPaymentNote}
                  onChange={(e) => setMarkPaymentNote(e.target.value)}
                  placeholder="e.g. UPI transfer"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors font-sans"
                />
              </div>

              {markPaymentError && (
                <div className="bg-red-950/50 border border-red-900/50 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {markPaymentError}
                </div>
              )}
              {markPaymentSuccess && (
                <div className="bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 text-xs p-3 rounded-lg flex items-center gap-2 font-semibold">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  {markPaymentSuccess}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMarkPaymentShop(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-400 hover:text-white border border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={markPaymentLoading} className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer">
                  {markPaymentLoading ? "Recording..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Revenue Simulator ───────────────────────────────────────────────────────
function RevenueSimulator({
  summary,
  insights,
  simFileThreshold, setSimFileThreshold,
  simFeePerBatch, setSimFeePerBatch,
  simFlatPerJob, setSimFlatPerJob,
  simGatewayCut, setSimGatewayCut,
  startDate,
  endDate,
}: {
  summary: any; insights: any;
  simFileThreshold: number; setSimFileThreshold: (v: number) => void;
  simFeePerBatch: number; setSimFeePerBatch: (v: number) => void;
  simFlatPerJob: number; setSimFlatPerJob: (v: number) => void;
  simGatewayCut: number; setSimGatewayCut: (v: number) => void;
  startDate: string;
  endDate: string;
}) {
  const totalJobs: number = summary.summary.totalCompletedJobs || 0;
  const totalRevenue: number = summary.summary.totalRevenue || 0;
  const avgFilesPerJob: number = insights.avgFilesPerJob ?? (summary.summary.avgPagesPerJob > 0 ? Math.ceil(summary.summary.avgPagesPerJob / 10) : 1);

  // Per-file batch fee: floor(files / threshold) * feePerBatch  per job
  const avgFileFee = Math.floor(Math.max(1, avgFilesPerJob) / Math.max(1, simFileThreshold)) * simFeePerBatch;
  const grossPerJob = avgFileFee + simFlatPerJob;
  const grossTotal = grossPerJob * totalJobs;
  const gatewayDeduction = grossTotal * (simGatewayCut / 100);
  const netRevenue = grossTotal - gatewayDeduction;

  // Calculate actual number of days in the selected date range to project correctly
  const getDaysInRange = (startStr: string, endStr: string) => {
    const s = new Date(startStr);
    const e = new Date(endStr);
    const diffTime = Math.abs(e.getTime() - s.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
    return isNaN(diffDays) || diffDays <= 0 ? 30 : diffDays;
  };

  const daysSelected = getDaysInRange(startDate, endDate);

  // Projections
  const jobsPerDay = totalJobs > 0 ? totalJobs / daysSelected : 0;
  const monthlyGross = grossPerJob * jobsPerDay * 30;
  const monthlyNet = monthlyGross * (1 - simGatewayCut / 100);

  const fmtINR = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDateString = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8">
      {/* Premium Hero Stats Header */}
      <div className="bg-gradient-to-br from-violet-950/80 via-violet-900/40 to-gray-900 border border-violet-800/60 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Platform Revenue Simulator</h2>
            <p className="text-sm text-violet-300/80 mt-1 max-w-xl">
              Model potential platforms fees over selected historical windows. Set rules to estimate your margins, processing overheads, and net yields.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <span className="bg-violet-950/80 border border-violet-800/60 text-violet-300 rounded-xl px-3 py-1.5 text-xs font-semibold font-mono">
                Period: {formatDateString(startDate)} - {formatDateString(endDate)} ({daysSelected} days)
              </span>
              <span className="bg-gray-800/90 border border-gray-700/60 text-gray-300 rounded-xl px-3 py-1.5 text-xs font-semibold font-mono">
                {totalJobs} Jobs Used
              </span>
              <span className="bg-gray-800/90 border border-gray-700/60 text-gray-300 rounded-xl px-3 py-1.5 text-xs font-semibold font-mono">
                ~{avgFilesPerJob.toFixed(1)} Files/Job Avg
              </span>
              <span className="bg-gray-800/90 border border-gray-700/60 text-amber-400 rounded-xl px-3 py-1.5 text-xs font-semibold font-mono">
                {fmtINR(totalRevenue)} GMV
              </span>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end bg-violet-950/50 border border-violet-900/60 rounded-2xl p-5 lg:min-w-[240px] shadow-lg">
            <span className="text-xs uppercase tracking-widest text-violet-300/70 font-bold">Estimated Net Revenue</span>
            <span className="text-3xl lg:text-4xl font-black text-emerald-400 font-mono tracking-tight mt-1">{fmtINR(netRevenue)}</span>
            <span className="text-[10px] text-gray-400 mt-1">For the {daysSelected}-day selected range</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel: Integrated Config (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-6 shadow-xl space-y-6">
            <div className="border-b border-gray-800 pb-4">
              <h3 className="text-lg font-bold text-white">Fee Configuration</h3>
              <p className="text-xs text-gray-400 mt-1">Adjust sliding controls or type exact numeric inputs below.</p>
            </div>

            {/* Fee Rule 1: File-Based Fee */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-400">File-Based Fee</span>
                <span className="text-[10px] text-gray-500 font-medium">Charge per batch of N files</span>
              </div>
              
              {/* Threshold (N) Input & Slider */}
              <div className="bg-gray-950/60 border border-gray-900 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-gray-300">Files per batch (N)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={1} max={100}
                      value={simFileThreshold}
                      onChange={(e) => setSimFileThreshold(Math.max(1, Number(e.target.value)))}
                      className="w-14 bg-gray-900 border border-gray-800 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-white focus:outline-none focus:border-violet-500 font-mono"
                    />
                    <span className="text-xs text-gray-400">files</span>
                  </div>
                </div>
                <input
                  type="range" min={1} max={20} step={1}
                  value={simFileThreshold}
                  onChange={(e) => setSimFileThreshold(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer h-1.5 rounded-lg bg-gray-800"
                />
              </div>

              {/* Price per Batch Input & Slider */}
              <div className="bg-gray-950/60 border border-gray-900 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-gray-300">Fee per batch (₹)</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">₹</span>
                    <input
                      type="number" min={0} max={500} step={0.5}
                      value={simFeePerBatch}
                      onChange={(e) => setSimFeePerBatch(Math.max(0, Number(e.target.value)))}
                      className="w-16 bg-gray-900 border border-gray-800 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-white focus:outline-none focus:border-violet-500 font-mono"
                    />
                  </div>
                </div>
                <input
                  type="range" min={0} max={20} step={0.5}
                  value={simFeePerBatch}
                  onChange={(e) => setSimFeePerBatch(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer h-1.5 rounded-lg bg-gray-800"
                />
              </div>

              <div className="bg-violet-950/20 border border-violet-900/30 rounded-xl p-3 text-[11px] text-violet-300/80 leading-relaxed font-sans">
                For average job (~{Math.round(avgFilesPerJob)} files): {Math.floor(Math.max(1, avgFilesPerJob) / Math.max(1, simFileThreshold))} batch(es) × ₹{simFeePerBatch} = <span className="font-bold text-white">₹{avgFileFee.toFixed(2)}</span>
              </div>
            </div>

            <div className="h-px bg-gray-800"></div>

            {/* Fee Rule 2: Flat Job Fee */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">Flat Job Fee</span>
                <span className="text-[10px] text-gray-500 font-medium">Flat fee charged on every job</span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-gray-300">Fee per job (₹)</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">₹</span>
                    <input
                      type="number" min={0} max={500} step={0.5}
                      value={simFlatPerJob}
                      onChange={(e) => setSimFlatPerJob(Math.max(0, Number(e.target.value)))}
                      className="w-16 bg-gray-900 border border-gray-800 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
                <input
                  type="range" min={0} max={50} step={0.5}
                  value={simFlatPerJob}
                  onChange={(e) => setSimFlatPerJob(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 rounded-lg bg-gray-800"
                />
              </div>
            </div>

            <div className="h-px bg-gray-800"></div>

            {/* Fee Rule 3: Payment Gateway Cut */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-500">Gateway Cut</span>
                <span className="text-[10px] text-gray-500 font-medium">Gateway processor transaction %</span>
              </div>
              <div className="bg-gray-950/60 border border-gray-900 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-gray-300">Processor cut (%)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={0} max={100} step={0.1}
                      value={simGatewayCut}
                      onChange={(e) => setSimGatewayCut(Math.max(0, Number(e.target.value)))}
                      className="w-14 bg-gray-900 border border-gray-800 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-white focus:outline-none focus:border-rose-500 font-mono"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
                <input
                  type="range" min={0} max={10} step={0.1}
                  value={simGatewayCut}
                  onChange={(e) => setSimGatewayCut(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer h-1.5 rounded-lg bg-gray-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Result & Projection Modules (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Revenue Waterfall Visualization Card */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-6 shadow-xl space-y-5">
            <h3 className="text-base font-bold text-white">Revenue Waterfall Model</h3>
            
            {/* Visual Bar representation */}
            <div className="space-y-2">
              <div className="flex h-5 rounded-full overflow-hidden bg-gray-950 border border-gray-800/80 p-0.5">
                {grossTotal > 0 ? (
                  <>
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-l-full transition-all duration-300"
                      style={{ width: `${100 - simGatewayCut}%` }}
                    />
                    {simGatewayCut > 0 && (
                      <div 
                        className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-r-full transition-all duration-300"
                        style={{ width: `${simGatewayCut}%` }}
                      />
                    )}
                  </>
                ) : (
                  <div className="h-full w-full bg-gray-800 rounded-full" />
                )}
              </div>
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Net Keep: {(100 - simGatewayCut).toFixed(1)}%
                </span>
                {simGatewayCut > 0 && (
                  <span className="text-rose-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    Gateway: {simGatewayCut.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* Structured Waterfall Breakdown */}
            <div className="bg-gray-950/70 border border-gray-800/70 rounded-2xl p-5 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center text-gray-400">
                <span>File-based earnings ({totalJobs} jobs)</span>
                <span className="text-white">{fmtINR(avgFileFee * totalJobs)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-400">
                <span>Flat job earnings ({totalJobs} jobs)</span>
                <span className="text-white">{fmtINR(simFlatPerJob * totalJobs)}</span>
              </div>
              <div className="h-px bg-gray-900 my-1"></div>
              <div className="flex justify-between items-center text-gray-300 font-bold">
                <span>Gross Simulated Revenue</span>
                <span className="text-white">{fmtINR(grossTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-rose-400/80">
                <span>Payment gateway fees (-{simGatewayCut}%)</span>
                <span>-{fmtINR(gatewayDeduction)}</span>
              </div>
              <div className="h-px bg-gray-900 my-1"></div>
              <div className="flex justify-between items-center text-base font-black text-emerald-400 pt-1">
                <span>Net Simulated Earnings</span>
                <span>{fmtINR(netRevenue)}</span>
              </div>
            </div>
          </div>

          {/* Projections Matrix */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white">Future Yield Forecast</h3>
              <span className="bg-violet-950 border border-violet-850 text-violet-300 rounded-lg px-2 py-0.5 text-[10px] font-bold font-mono">
                Paced off {daysSelected} days of data
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-950/50 border border-gray-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Gross / Month (30 Days)</span>
                <p className="text-2xl font-black text-white font-mono">{fmtINR(monthlyGross)}</p>
                <p className="text-[10px] text-gray-500">Projected {Math.round(jobsPerDay * 30)} simulated jobs</p>
              </div>

              <div className="bg-gray-950/50 border border-gray-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Net Profit / Month (30 Days)</span>
                <p className="text-2xl font-black text-emerald-400 font-mono">{fmtINR(monthlyNet)}</p>
                <p className="text-[10px] text-gray-500">Profit after processor cut</p>
              </div>

              <div className="bg-gray-950/50 border border-gray-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Annualized Net Profit</span>
                <p className="text-2xl font-black text-violet-400 font-mono">{fmtINR(monthlyNet * 12)}</p>
                <p className="text-[10px] text-gray-500">Yearly outlook at current rate</p>
              </div>

              <div className="bg-gray-950/50 border border-gray-800 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Platform Take Rate</span>
                <p className="text-2xl font-black text-amber-400 font-mono">{totalRevenue > 0 ? ((netRevenue / totalRevenue) * 100).toFixed(1) : "0.0"}%</p>
                <p className="text-[10px] text-gray-500">Simulated share of {fmtINR(totalRevenue)} GMV</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardMetric({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-xl sm:text-2xl font-black mt-1.5 ${color}`}>{value}</p>
    </div>
  );
}

function MetricRow({ label, value, desc }: { label: string; value: any; desc: string }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0">
      <div>
        <p className="text-sm font-semibold text-gray-200">{label}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
      </div>
      <span className="text-sm font-bold text-white bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1 font-mono">
        {value}
      </span>
    </div>
  );
}
