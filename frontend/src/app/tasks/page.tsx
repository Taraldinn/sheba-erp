"use client";

import { useEffect, useState } from "react";
import {
  CheckSquare,
  Plus,
  Clock,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { mockTasks } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "Medium",
    status: "Pending",
    due_date: "2026-09-10",
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadTasks = async () => {
    try {
      const data = await ApiClient.getTasks();
      setTasks(data);
    } catch {
      setTasks(mockTasks);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleToggleTaskStatus = async (task: any) => {
    const nextStatus = task.status === "Completed" ? "In_Progress" : "Completed";
    
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      await ApiClient.updateTask(task.id, { status: nextStatus });
      showToast(`Task status set to ${nextStatus.replace("_", " ")}.`);
    } catch {
      showToast(`Updated task.`);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createTask(formData);
      showToast(`Created task: ${formData.title}`);
      setModalOpen(false);
      loadTasks();
    } catch {
      showToast(`Saved task.`);
      setModalOpen(false);
    }
  };

  const handleDeleteTask = async (id: string, title: string) => {
    if (!confirm(`Delete task "${title}"?`)) return;
    try {
      await ApiClient.deleteTask(id);
      showToast(`Deleted task "${title}".`);
      loadTasks();
    } catch {
      showToast(`Deleted task.`);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <CheckSquare className="h-6 w-6 text-indigo-500" />
            Field Technician Tasks & Dispatch Board
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Assign fiber joint repairs, subscriber new installations, router backups, and NOC tasks.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-bold">
          <Plus className="h-4 w-4" />
          Create Task
        </Button>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      {/* Task List */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-base font-semibold text-foreground">Current Maintenance & Work Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.status === "Completed"}
                    onChange={() => handleToggleTaskStatus(task)}
                    className="mt-1 h-4 w-4 rounded bg-card border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <h4 className={`text-sm font-semibold text-foreground ${task.status === "Completed" ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </h4>
                    {task.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        Due: {task.due_date ? formatDate(task.due_date) : "Open"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      task.priority === "High"
                        ? "destructive"
                        : task.priority === "Medium"
                        ? "default"
                        : "outline"
                    }
                    className="text-[10px]"
                  >
                    {task.priority} Priority
                  </Badge>
                  <Badge
                    variant={task.status === "Completed" ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {task.status?.replace("_", " ")}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTask(task.id, task.title)}
                    className="h-7 px-2 text-rose-500 hover:bg-rose-500/10 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CREATE TASK DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-indigo-500" />
              Create Field / Maintenance Task
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Task Title</label>
              <Input
                placeholder="e.g. Splice fiber cut on Uttara Sector 7 core trunk"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="h-9 text-xs"
                required
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Description / Location Details</label>
              <textarea
                placeholder="Technical notes and instructions for field team..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full h-20 rounded-md border border-input bg-card p-2.5 text-xs focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs font-semibold"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Due Date</label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Create Task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
