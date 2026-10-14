"""
Celery Entrypoint for Sheba ISP ERP (Stage 4).
==============================================
Defines the Celery application, auto-discovers tasks across all installed apps,
and integrates with Django configuration.
"""

import os
from celery import Celery

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sheba_core.settings')

app = Celery('sheba_core')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Safe Celery ping / debug health probe that never leaks payloads."""
    task_id = getattr(self.request, 'id', 'unknown')
    return {'status': 'healthy', 'task_id': str(task_id)}


from celery.signals import task_failure


@task_failure.connect
def handle_task_failure(sender=None, task_id=None, exception=None, args=None, kwargs=None, traceback=None, einfo=None, **other):
    """
    Dispatches automated operational alert to tech team when a background Celery task crashes.
    """
    try:
        from apps.core.email.service import EmailService
        task_name = getattr(sender, 'name', str(sender))
        EmailService.send_system_failure_alert(
            error_type=f"CeleryTaskFailure: {task_name}",
            error_message=str(exception),
            traceback_str=str(einfo or traceback or ''),
            path=f"celery://task/{task_name}",
            method="ASYNC_TASK",
            user=f"task_id={task_id}"
        )
    except Exception:
        pass


