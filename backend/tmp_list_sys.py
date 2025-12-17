from app.db import get_session
from app.models import System
from sqlmodel import select
session = next(get_session())
for sys in session.exec(select(System)):
    print(sys.id, sys.name)
