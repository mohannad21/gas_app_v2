"""
Create and activate a distributor user.
Usage: python scripts/create_user.py
Requires the backend to be running with DEBUG=true.
"""

import sys
import urllib.request
import urllib.error
import json
import getpass

BASE_URL = "http://localhost:8000"


def post(path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = json.loads(e.read())
        print(f"Error {e.code}: {error_body.get('detail', e.reason)}")
        sys.exit(1)


def main():
    print("=== Create Distributor Account ===\n")

    phone = input("Phone number: ").strip()
    business_name = input("Business name: ").strip()

    print("\nCreating user...")
    result = post("/auth/developer/create-user", {"phone": phone, "name": business_name})
    user_id = result["user_id"]
    code = result["activation_code"]

    print(f"User created. Activation code: {code}")
    print("\nActivating account...")

    password = getpass.getpass("Set password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    post("/auth/activate", {"user_id": user_id, "code": code, "password": password})
    print("\nAccount activated. You can now sign in with:")
    print(f"  Phone:    {phone}")
    print(f"  Password: (the one you just set)")


if __name__ == "__main__":
    main()
