"""initial_schema_users_rooms_members

Revision ID: aa58e65bbbac
Revises: 
Create Date: 2026-10-01 02:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa58e65bbbac'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 2. rooms table
    op.create_table(
        'rooms',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('room_code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_rooms_room_code', 'rooms', ['room_code'], unique=True)
    op.create_index('ix_rooms_owner_id', 'rooms', ['owner_id'], unique=False)

    # 3. room_members table
    op.create_table(
        'room_members',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('room_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=20), server_default='member', nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('room_id', 'user_id', name='uq_room_members_room_user')
    )
    op.create_index('ix_room_members_room_id', 'room_members', ['room_id'], unique=False)
    op.create_index('ix_room_members_user_id', 'room_members', ['user_id'], unique=False)
    op.create_index('ix_room_members_room_user', 'room_members', ['room_id', 'user_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_room_members_room_user', table_name='room_members')
    op.drop_index('ix_room_members_user_id', table_name='room_members')
    op.drop_index('ix_room_members_room_id', table_name='room_members')
    op.drop_table('room_members')

    op.drop_index('ix_rooms_owner_id', table_name='rooms')
    op.drop_index('ix_rooms_room_code', table_name='rooms')
    op.drop_table('rooms')

    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
