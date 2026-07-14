alter table coach_messages alter column id set generated always;

create index coach_messages_conversation_id_idx on coach_messages (conversation_id, created_at);
