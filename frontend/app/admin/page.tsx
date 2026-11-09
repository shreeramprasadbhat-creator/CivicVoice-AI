
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Complaint = {
  complaint_id: string;
  description: string;
  location: string;
  email: string;
  category: string;
  severity: string;
  priority: string;
  status: string;
  created_at: string;
  report_count: number;
};

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export default function AdminDashboard() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [updatingId, setUpdatingId] = useState("");

  async function fetchComplaints() {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/complaints`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        localStorage.removeItem("admin_token");
        router.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load complaints.");
      }

      const data = await response.json();
      const records: Complaint[] = data.complaints || [];

      setComplaints(records);

      // Sum individual reports across all unique issues.
      setTotalReports(
        records.reduce(
          (total, complaint) =>
            total + Number(complaint.report_count || 0),
          0
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setAuthenticated(true);
    fetchComplaints();
  }, []);

  async function updateStatus(
    complaintId: string,
    status: string
  ) {
    setUpdatingId(complaintId);
    setError("");

    try {
      const response = await fetch(
        `${API}/complaints/${complaintId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}`,
          },
          body: JSON.stringify({ status }),
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("admin_token");
        router.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.detail || "Status update failed."
        );
      }

      setComplaints((previous) =>
        previous.map((complaint) =>
          complaint.complaint_id === complaintId
            ? {
                ...complaint,
                status: data.complaint.status,
              }
            : complaint
        )
      );

      const sent = Number(data.emails_sent || 0);
      const recipients = Number(
        data.email_recipients || 0
      );

      alert(
        `Status updated successfully.\n${sent} of ${recipients} notification emails sent.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update status."
      );
    } finally {
      setUpdatingId("");
    }
  }

  // Resolved issues stay in the database and remain included in the summary,
  // but are hidden from the active work queue.
  const filteredComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      if (complaint.status === "Resolved") return false;

      const matchesFilter =
        filter === "All" || complaint.status === filter;

      const searchText = search.toLowerCase();

      const matchesSearch = [
        complaint.complaint_id,
        complaint.description,
        complaint.location,
        complaint.category,
        complaint.email,
      ].some((value) =>
        (value || "").toLowerCase().includes(searchText)
      );

      return matchesFilter && matchesSearch;
    });
  }, [complaints, filter, search]);

  const pending = complaints.filter(
    (item) => item.status === "Pending"
  ).length;

  const inProgress = complaints.filter(
    (item) => item.status === "In Progress"
  ).length;

  const resolved = complaints.filter(
    (item) => item.status === "Resolved"
  ).length;

  function statusColor(status: string) {
    if (status === "Resolved") {
      return "bg-emerald-100 text-emerald-700";
    }

    if (status === "In Progress") {
      return "bg-blue-100 text-blue-700";
    }

    return "bg-amber-100 text-amber-700";
  }

  function logout() {
    localStorage.removeItem("admin_token");
    router.replace("/admin/login");
  }

  function severityColor(severity: string) {
    if (severity === "High") return "text-red-600";
    if (severity === "Low") return "text-emerald-600";
    return "text-amber-600";
  }

  const summaryCards = [
    {
      label: "Unique Issues",
      value: complaints.length,
      color: "text-[#123b70]",
    },
    {
      label: "Citizen Reports",
      value: totalReports,
      color: "text-purple-600",
    },
    {
      label: "Pending Issues",
      value: pending,
      color: "text-amber-600",
    },
    {
      label: "In Progress",
      value: inProgress,
      color: "text-blue-600",
    },
    {
      label: "Resolved",
      value: resolved,
      color: "text-emerald-600",
    },
  ];

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">Checking admin session...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">

      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div>
            <h1 className="text-xl font-bold text-[#123b70]">
              CivicVoice AI
            </h1>
            <p className="text-xs text-slate-500">
              Civic Administration Portal
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
              Admin Dashboard
            </span>

            <button
              onClick={logout}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Logout
            </button>

            <button
              onClick={fetchComplaints}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">

        {/* TITLE */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[#123b70]">
            Complaint Management
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Monitor civic issues and manage citizen reports.
          </p>
        </div>

        {/* SUMMARY CARDS */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">
                {card.label}
              </p>
              <p className={`mt-3 text-3xl font-bold ${card.color}`}>
                {card.value}
              </p>
            </div>
          ))}
        </section>

        {/* SEARCH AND FILTER */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row">
            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search ID, description, location or email..."
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 md:flex-1"
            />

            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value)
              }
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600"
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
            </select>
          </div>
        </section>

        {/* ERROR */}
        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* COMPLAINT TABLE */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="font-bold text-[#123b70]">
                Consolidated Civic Issues
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {filteredComplaints.length} active issues · Resolved issues are archived
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Loading complaints...
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No complaints found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Primary Complaint</th>
                    <th className="px-5 py-4">Reports</th>
                    <th className="px-5 py-4">Category</th>
                    <th className="px-5 py-4">Location</th>
                    <th className="px-5 py-4">Severity</th>
                    <th className="px-5 py-4">Priority</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Update Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredComplaints.map((complaint) => (
                    <tr
                      key={complaint.complaint_id}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-[#123b70]">
                          {complaint.complaint_id}
                        </p>
                        <p className="mt-1 max-w-xs text-xs text-slate-500">
                          {complaint.description}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-purple-100 px-3 py-1 font-semibold text-purple-700">
                          {complaint.report_count || 0} reports
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {complaint.category}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {complaint.location}
                      </td>

                      <td className={`px-5 py-4 font-semibold ${severityColor(complaint.severity)}`}>
                        {complaint.severity}
                      </td>

                      <td className="px-5 py-4">
                        {complaint.priority}
                      </td>

                      <td className="px-5 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(complaint.status)}`}>
                          {complaint.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={complaint.status}
                          disabled={
                            updatingId === complaint.complaint_id
                          }
                          onChange={(event) =>
                            updateStatus(
                              complaint.complaint_id,
                              event.target.value
                            )
                          }
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-600 disabled:opacity-50"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>

                        {updatingId === complaint.complaint_id && (
                          <p className="mt-1 text-xs text-slate-400">
                            Updating...
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          CivicVoice AI · Administration Portal
        </footer>
      </div>
    </main>
  );
}
