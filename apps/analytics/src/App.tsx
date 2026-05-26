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
  const [activeTab, setActiveTab] = useState<"dashboard" | "shops">("dashboard");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Shop creation form state
  const [newShopUsername, setNewShopUsername] = useState("");
  const [newShopPassword, setNewShopPassword] = useState("");
  const [newShopId, setNewShopId] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState("");
  const [createError, setCreateError] = useState("");

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
      if (token) fetchAnalytics(token);
    } catch (err: any) {
      setCreateError(err.message || "Something went wrong.");
    } finally {
      setCreateLoading(false);
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
                          <th className="pb-3 px-2 text-right">Completed Jobs</th>
                          <th className="pb-3 px-2 text-right">Pages Printed</th>
                          <th className="pb-3 pl-2 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {shopsData.shops.map((shop: any) => (
                          <tr key={shop.id} className="hover:bg-gray-800/10 transition-colors">
                            <td className="py-3.5 pr-2">
                              <p className="font-bold text-white">{shop.username}</p>
                              <p className="text-xs text-gray-500 font-mono mt-0.5">{shop.shopId}</p>
                            </td>
                            <td className="py-3.5 px-2 text-right font-mono text-gray-300">{shop.completedJobsCount}</td>
                            <td className="py-3.5 px-2 text-right font-mono text-gray-300">{shop.totalPagesPrinted}</td>
                            <td className="py-3.5 pl-2 text-right font-mono text-amber-500 font-bold">₹{shop.totalRevenue}</td>
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
