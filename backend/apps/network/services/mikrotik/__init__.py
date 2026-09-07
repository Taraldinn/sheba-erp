"""
MikroTik service layer (Plan Phase G / Phase 13).

Package structure:
  client.py   — RouterClient: low-level connection wrapper
  service.py  — MikroTikService: business operations
  sync.py     — Full router sync (PPPoE users, profiles, sessions)
  sessions.py — Active session management
  profiles.py — Bandwidth profile / queue management
  users.py    — PPPoE user CRUD

Views call MikroTikService.
MikroTikService calls RouterClient.
Frontend NEVER talks to MikroTik directly.
"""
from .client import RouterClient
from .service import MikroTikService

__all__ = ['RouterClient', 'MikroTikService']
