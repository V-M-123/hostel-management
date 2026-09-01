-- 004_seed.sql
-- Seed script for hostels and rooms
-- NOTE: Warden assignment and student data require actual user signups first via Supabase Auth.
-- This script only populates hostels and rooms.

DO $$
DECLARE
    v_hostel_a uuid := gen_random_uuid();
    v_hostel_b uuid := gen_random_uuid();
    v_hostel_c uuid := gen_random_uuid();
    i int;
    floor_num int;
BEGIN
    -- Insert Hostels
    INSERT INTO public.hostels (id, name, address) VALUES (v_hostel_a, 'Block A - Boys', 'North Campus, Block A');
    INSERT INTO public.hostels (id, name, address) VALUES (v_hostel_b, 'Block B - Girls', 'South Campus, Block B');
    INSERT INTO public.hostels (id, name, address) VALUES (v_hostel_c, 'Block C - Co-ed', 'Central Campus, Block C');

    -- Insert Rooms for Block A (10 rooms, 5 per floor, 2 floors, capacity 3)
    FOR floor_num IN 1..2 LOOP
        FOR i IN 1..5 LOOP
            INSERT INTO public.rooms (hostel_id, room_number, floor, capacity)
            VALUES (v_hostel_a, 'A' || floor_num || '0' || i, floor_num, 3);
        END LOOP;
    END LOOP;

    -- Insert Rooms for Block B (8 rooms, 4 per floor, 2 floors, capacity 2)
    FOR floor_num IN 1..2 LOOP
        FOR i IN 1..4 LOOP
            INSERT INTO public.rooms (hostel_id, room_number, floor, capacity)
            VALUES (v_hostel_b, 'B' || floor_num || '0' || i, floor_num, 2);
        END LOOP;
    END LOOP;

    -- Insert Rooms for Block C (6 rooms, 3 per floor, 2 floors, capacity 4)
    FOR floor_num IN 1..2 LOOP
        FOR i IN 1..3 LOOP
            INSERT INTO public.rooms (hostel_id, room_number, floor, capacity)
            VALUES (v_hostel_c, 'C' || floor_num || '0' || i, floor_num, 4);
        END LOOP;
    END LOOP;
END $$;
