from django.contrib import admin
from .models import Ticket, TicketReply


class TicketReplyInline(admin.StackedInline):
    model = TicketReply
    extra = 1
    readonly_fields = ('created_at',)


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ('ticket_no', 'subject', 'customer', 'category', 'priority', 'status', 'assigned_to', 'tenant', 'created_at')
    list_filter = ('priority', 'status', 'category', 'tenant', 'created_at')
    search_fields = ('ticket_no', 'subject', 'description', 'customer__full_name', 'customer__pppoe_username')
    ordering = ('-created_at',)
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [TicketReplyInline]
    date_hierarchy = 'created_at'


@admin.register(TicketReply)
class TicketReplyAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'sender_name', 'is_staff', 'created_at')
    list_filter = ('is_staff', 'created_at')
    search_fields = ('ticket__ticket_no', 'sender_name', 'message')
    readonly_fields = ('id', 'created_at')
