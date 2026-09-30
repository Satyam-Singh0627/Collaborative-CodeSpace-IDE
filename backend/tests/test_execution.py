"""
Tests for Code Execution API endpoint and stdin handling.

Covers:
1. Python program with input() receiving stdin ("Satyam") -> "Hello Satyam"
2. Python normal program without input()
3. Python program with input() and empty/no stdin -> graceful handling (no crash)
4. Python multi-line input handling
5. Multi-language execution / registry stability
"""
import uuid
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.database import Base, engine


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client):
    unique = uuid.uuid4().hex[:8]
    email = f"exec_{unique}@example.com"
    res = client.post("/api/auth/register", json={
        "name": "Exec Tester",
        "email": email,
        "password": "Password123!"
    })
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_python_with_input_and_stdin(client, auth_headers):
    """
    Test Python interactive program receiving stdin:
    name = input("Enter name: ")
    print("Hello", name)
    with stdin "Satyam" -> Expected output includes "Hello Satyam"
    """
    code = (
        'name = input("Enter name: ")\n'
        'print("Hello", name)\n'
    )
    res = client.post(
        "/api/execute",
        headers=auth_headers,
        json={
            "language": "python",
            "code": code,
            "stdin": "Satyam",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "Hello Satyam" in data["output"]


def test_python_normal_program_without_input(client, auth_headers):
    """
    Test regular Python program without input() continues working normally.
    """
    code = (
        'def add(a, b):\n'
        '    return a + b\n'
        'print("Sum:", add(10, 25))\n'
    )
    res = client.post(
        "/api/execute",
        headers=auth_headers,
        json={
            "language": "python",
            "code": code,
            "stdin": "",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "Sum: 35" in data["output"]


def test_python_input_with_empty_stdin_graceful(client, auth_headers):
    """
    Test Python program with input() when no stdin is provided:
    must handle EOFError gracefully without an unhandled traceback crash.
    """
    code = 'choice = input("Enter your choice: ")\nprint("Choice:", choice)\n'
    res = client.post(
        "/api/execute",
        headers=auth_headers,
        json={
            "language": "python",
            "code": code,
            "stdin": "",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "error"
    # Verify graceful explanation is present
    assert "EOFError" in data["output"]
    assert "Input (stdin)" in data["output"]
    # Verify prompt was retained
    assert "Enter your choice" in data["output"]


def test_python_multiple_inputs(client, auth_headers):
    """
    Test multiple input() calls with newline-separated stdin.
    """
    code = (
        'x = input()\n'
        'y = input()\n'
        'print(f"Result: {x} & {y}")\n'
    )
    res = client.post(
        "/api/execute",
        headers=auth_headers,
        json={
            "language": "python",
            "code": code,
            "stdin": "FirstValue\nSecondValue\n",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "Result: FirstValue & SecondValue" in data["output"]


def test_supported_languages_list(client, auth_headers):
    """
    Verify /api/execute/languages returns supported languages registry.
    """
    res = client.get("/api/execute/languages", headers=auth_headers)
    assert res.status_code == 200
    langs = res.json()
    assert any(l["key"] == "python" for l in langs)
    assert any(l["key"] == "javascript" for l in langs)
