from django.contrib import admin
from .models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'assigned_to', 'priority', 'status', 'due_date', 'tenant', 'created_at')
    list_filter = ('priority', 'status', 'tenant', 'created_at')
    search_fields = ('title', 'description', 'assigned_to__username', 'assigned_to__first_name', 'assigned_to__last_name')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at', 'updated_at')
