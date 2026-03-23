from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

try:
    from elizaos.types import Action, ActionResult, Plugin, Provider, ProviderResult
except ImportError:
    # Keep the standalone Python package importable when the full elizaos Python runtime
    # is not installed in the local test environment.

    @dataclass
    class ActionResult:
        success: bool
        text: str | None = None
        error: str | None = None
        data: dict[str, object] = field(default_factory=dict)


    @dataclass
    class Action:
        name: str
        description: str
        similes: list[str] | None = None
        examples: Any = None
        validate: Any = None
        handler: Any = None


    @dataclass
    class ProviderResult:
        text: str
        values: dict[str, object] = field(default_factory=dict)
        data: dict[str, object] = field(default_factory=dict)


    @dataclass
    class Provider:
        name: str
        description: str
        get: Any
        dynamic: bool = False


    @dataclass
    class Plugin:
        name: str
        description: str
        init: Any = None
        actions: list[Action] = field(default_factory=list)
        providers: list[Provider] = field(default_factory=list)


__all__ = [
    "Action",
    "ActionResult",
    "Plugin",
    "Provider",
    "ProviderResult",
]
