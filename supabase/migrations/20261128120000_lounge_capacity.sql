-- Student Lounge (Alangilan): capacity about 150, the project owner's estimate (2026-11-28, not measured; flagged
-- for review in the app). The app takes capacity from its registry (src/campuses), so this keeps the table in step.
update safe_spots set capacity = 150, occupied = least(occupied, 150) where id = 'lounge';
