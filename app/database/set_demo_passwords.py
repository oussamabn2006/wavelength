"""Give the first N seeded users a real password so they can log in (the seed stores a placeholder).

    docker compose exec backend python -m app.database.set_demo_passwords 5 demo1234

No schema change, no reseed: it only updates password_hash.
"""
import sys

from sqlalchemy import select

from app.database import models as m
from app.database.postgres import get_db
from app.routers.users import hash_password


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    password = sys.argv[2] if len(sys.argv) > 2 else "demo1234"
    db = next(get_db())
    users = db.scalars(select(m.AppUser).order_by(m.AppUser.user_id).limit(n)).all()
    for u in users:
        u.password_hash = hash_password(password)
    db.commit()
    print(f"Password set to '{password}' for {len(users)} users:")
    for u in users:
        print(f"  user {u.user_id}: {u.email}")


if __name__ == "__main__":
    main()
