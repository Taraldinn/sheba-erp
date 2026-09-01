"use client";

import { useState } from "react";
import {
  CheckSquare,
  Plus,
  Clock,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockTasks, TaskItem } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>(mockTasks);

  const handleToggleTaskStatus = (taskId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: t.status === "Completed" ? ("In_Progress" as const) : ("Completed" as const),
        };
      }
      return t;
    });
    setTasks(updated);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Field Technician Tasks & Dispatch Board</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Assign fiber joint repairs, subscriber new installations, router backups, and NOC tasks.
          </p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
          <Plus className="h-4 w-4" />
          Create Task
        </Button>
      </div>

      {/* Task List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Current Maintenance Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-800/80">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-card/60 p-2 rounded-xl transition-colors"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.status === "Completed"}
                    onChange={() => handleToggleTaskStatus(task.id)}
                    className="mt-1 h-4 w-4 rounded bg-card border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <h4 className={`text-sm font-semibold text-foreground ${task.status === "Completed" ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {task.assigned_to}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        Due: {formatDate(task.due_date)}
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
                        ? "warning"
                        : "default"
                    }
                    className="text-[10px]"
                  >
                    {task.priority} Priority
                  </Badge>
                  <Badge
                    variant={task.status === "Completed" ? "success" : "secondary"}
                    className="text-[10px]"
                  >
                    {task.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
