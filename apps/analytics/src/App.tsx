import { useEffect, useState } from "react";

export default function App() {
  const [startDate, setStartDate] = useState("2026-04-29");
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [summary, setSummary] = useState<any>(null);
  const [users, setUsers] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const fetchAnalytics = async () => {
    setLoading(true);
    setError("");
    try {
      const query = `?startDate=${startDate}&endDate=${endDate}`;
      const [sumRes, usrRes, insRes] = await Promise.all([
        fetch(`/api/v1/analysis/summary${query}`),
        fetch(`/api/v1/analysis/users${query}`),
        fetch(`/api/v1/analysis/insights${query}`),
      ]);

      if (!sumRes.ok || !usrRes.ok || !insRes.ok) {
        throw new Error("Failed to fetch analytics data");
      }

      setSummary(await sumRes.json());
      setUsers(await usrRes.json());
      setInsights(await insRes.json());
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Analytics Dashboard
            </h1>
            <p className="text-gray-500 mt-1">
              Data strictly from April 29, 2026 onwards.
            </p>
          </div>

          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">From:</label>
              <input
                type="date"
                min="2026-04-29"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">To:</label>
              <input
                type="date"
                min="2026-04-29"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
              />
            </div>
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : "Apply Filter"}
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded border border-red-200">
            {error}
          </div>
        )}

        {!loading && summary && users && insights && (
          <div className="grid grid-cols-1 gap-8">
            {/* Financial & Job Summary Table */}
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-800">
                  Financial &amp; Operations
                </h2>
              </div>
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-gray-700 uppercase text-xs border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 font-medium">Metric</th>
                    <th className="px-6 py-3 font-medium">Value</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <TableRow
                    label="Total Revenue"
                    value={`₹${summary.summary.totalRevenue.toLocaleString()}`}
                    desc="Revenue generated in period"
                  />
                  <TableRow
                    label="Total Completed Jobs"
                    value={summary.summary.totalCompletedJobs}
                    desc="Number of successful prints"
                  />
                  <TableRow
                    label="Total Pages Printed"
                    value={summary.summary.totalPages}
                    desc="Sum of all pages across jobs"
                  />
                  <TableRow
                    label="Avg Order Value"
                    value={`₹${summary.summary.avgOrderValue.toFixed(2)}`}
                    desc="Average revenue per job"
                  />
                  <TableRow
                    label="Overall Conversion"
                    value={`${(
                      summary.funnel.overallConversion * 100
                    ).toFixed(1)}%`}
                    desc="Draft & Pending to Completed"
                  />
                </tbody>
              </table>
            </section>

            {/* Users & Insights Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="font-semibold text-gray-800">User Growth</h2>
                </div>
                <table className="w-full text-left text-sm text-gray-600">
                  <tbody className="divide-y divide-gray-100">
                    <TableRow
                      label="New Users"
                      value={users.acquisition.totalNewUsers}
                      desc="Acquired in period"
                    />
                    <TableRow
                      label="Active Users"
                      value={users.acquisition.totalActiveUsers}
                      desc="Users with activity"
                    />
                    <TableRow
                      label="Repeat Customers"
                      value={users.retention.repeatCustomers}
                      desc="Ordered > 1 times"
                    />
                    <TableRow
                      label="Onboarding Completed"
                      value={users.onboarding.completed}
                      desc="Finished setup flow"
                    />
                    <TableRow
                      label="Activation Rate"
                      value={`${(
                        users.acquisition.activationRate * 100
                      ).toFixed(1)}%`}
                      desc="New users placing order"
                    />
                  </tbody>
                </table>
              </section>

              <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="font-semibold text-gray-800">
                    Advanced Insights
                  </h2>
                </div>
                <table className="w-full text-left text-sm text-gray-600">
                  <tbody className="divide-y divide-gray-100">
                    <TableRow
                      label="ARPU"
                      value={`₹${insights.arpu}`}
                      desc="Average Revenue Per User"
                    />
                    <TableRow
                      label="Churn Rate"
                      value={`${insights.churnRate}%`}
                      desc="Inactive > 30 days"
                    />
                    <TableRow
                      label="Total Platform Users"
                      value={insights.userMetrics.total}
                      desc="Lifetime active & inactive"
                    />
                    <TableRow
                      label="WhatsApp Synced"
                      value={summary.whatsapp.syncedUsers}
                      desc="Linked accounts"
                    />
                    <TableRow
                      label="WA OTP Success"
                      value={`${(
                        summary.whatsapp.otpSuccessRate * 100
                      ).toFixed(1)}%`}
                      desc="Login completion"
                    />
                  </tbody>
                </table>
              </section>
            </div>

            {/* Peak Hours Simple Table */}
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-semibold text-gray-800">
                  Peak Hours Distribution (Activity count)
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-center text-sm text-gray-600">
                  <thead className="bg-gray-50 text-gray-700 text-xs border-b border-gray-200">
                    <tr>
                      {insights.peakHours.map((_: number, i: number) => (
                        <th key={i} className="px-2 py-3 font-medium border-r border-gray-100 last:border-0">
                          {i.toString().padStart(2, "0")}h
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {insights.peakHours.map((val: number, i: number) => (
                        <td key={i} className="px-2 py-4 border-r border-gray-100 last:border-0">
                          {val}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function TableRow({
  label,
  value,
  desc,
}: {
  label: string;
  value: string | number;
  desc: string;
}) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-3 font-medium text-gray-900">{label}</td>
      <td className="px-6 py-3 font-semibold text-gray-800">{value}</td>
      <td className="px-6 py-3 text-gray-500 text-xs">{desc}</td>
    </tr>
  );
}
