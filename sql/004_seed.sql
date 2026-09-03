-- 004_seed.sql
-- Seed script for 4 Hostels with 5 Wardens per hostel, 3 Admins, and 50 Students in each hostel (200 total students).

DO $$
DECLARE
    -- 4 Hostels
    v_hostel_a uuid := gen_random_uuid();
    v_hostel_b uuid := gen_random_uuid();
    v_hostel_c uuid := gen_random_uuid();
    v_hostel_d uuid := gen_random_uuid();

    -- Admins
    v_admin_1 uuid := gen_random_uuid();
    v_admin_2 uuid := gen_random_uuid();
    v_admin_3 uuid := gen_random_uuid();

    -- Arrays for iteration
    hostel_ids uuid[] := ARRAY[v_hostel_a, v_hostel_b, v_hostel_c, v_hostel_d];
    hostel_codes text[] := ARRAY['A', 'B', 'C', 'D'];
    hostel_names text[] := ARRAY['Block A - North Wing (Boys)', 'Block B - South Wing (Girls)', 'Block C - East Wing (Co-ed)', 'Block D - West Wing (International)'];
    hostel_addresses text[] := ARRAY['North Campus, Sector 1', 'South Campus, Sector 4', 'East Campus, Sector 2', 'West Campus, Sector 5'];

    h_idx int;
    w_idx int;
    s_idx int;
    fl_idx int;
    rm_idx int;

    v_warden_id uuid;
    v_student_id uuid;
    v_room_id uuid;
    v_room_number text;
    v_primary_warden uuid;
BEGIN
    -- 1. CLEAN EXISTING DATA (Optional safe reset)
    DELETE FROM public.announcements;
    DELETE FROM public.leave_requests;
    DELETE FROM public.complaints;
    DELETE FROM public.fee_payments;
    DELETE FROM public.room_allocations;
    DELETE FROM public.rooms;
    DELETE FROM public.hostel_wardens;
    DELETE FROM public.hostels;
    DELETE FROM public.profiles;

    -- 2. CREATE 3 ADMINS
    INSERT INTO public.profiles (id, full_name, role, phone)
    VALUES 
        (v_admin_1, 'Dr. Rajesh Sharma', 'admin', '+91 9811100001'),
        (v_admin_2, 'Prof. Sunita Rao', 'admin', '+91 9811100002'),
        (v_admin_3, 'Mr. Amit Verma', 'admin', '+91 9811100003')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

    -- 3. CREATE 4 HOSTELS & WARDENS (5 Wardens per Hostel)
    FOR h_idx IN 1..4 LOOP
        -- Insert 5 Wardens for this hostel
        FOR w_idx IN 1..5 LOOP
            v_warden_id := gen_random_uuid();
            
            INSERT INTO public.profiles (id, full_name, role, phone)
            VALUES (
                v_warden_id, 
                'Warden ' || hostel_codes[h_idx] || '-' || w_idx || ' (' || split_part(hostel_names[h_idx], ' ', 2) || ')', 
                'warden', 
                '+91 98222' || lpad((h_idx * 10 + w_idx)::text, 5, '0')
            )
            ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

            IF w_idx = 1 THEN
                v_primary_warden := v_warden_id;
                -- Insert Hostel with Lead Warden
                INSERT INTO public.hostels (id, name, address, warden_id)
                VALUES (hostel_ids[h_idx], hostel_names[h_idx], hostel_addresses[h_idx], v_primary_warden);
            END IF;

            -- Link all 5 Wardens in hostel_wardens junction table
            INSERT INTO public.hostel_wardens (hostel_id, warden_id)
            VALUES (hostel_ids[h_idx], v_warden_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    -- 4. CREATE ROOMS (25 rooms with capacity 2 = 50 student capacity per hostel)
    -- 5 floors per hostel, 5 rooms per floor = 25 rooms * 4 hostels = 100 rooms total
    FOR h_idx IN 1..4 LOOP
        FOR fl_idx IN 1..5 LOOP
            FOR rm_idx IN 1..5 LOOP
                v_room_number := hostel_codes[h_idx] || fl_idx || '0' || rm_idx;
                
                INSERT INTO public.rooms (id, hostel_id, room_number, floor, capacity, occupied_count)
                VALUES (gen_random_uuid(), hostel_ids[h_idx], v_room_number, fl_idx, 2, 2);
            END LOOP;
        END LOOP;
    END LOOP;

    -- 5. CREATE 50 STUDENTS IN EACH HOSTEL (200 Students Total) & ALLOCATE ROOMS
    FOR h_idx IN 1..4 LOOP
        s_idx := 1;
        FOR fl_idx IN 1..5 LOOP
            FOR rm_idx IN 1..5 LOOP
                v_room_number := hostel_codes[h_idx] || fl_idx || '0' || rm_idx;
                
                SELECT id INTO v_room_id FROM public.rooms 
                WHERE hostel_id = hostel_ids[h_idx] AND room_number = v_room_number;

                -- Allocate 2 students per room (2 * 25 = 50 students per hostel)
                FOR i IN 1..2 LOOP
                    v_student_id := gen_random_uuid();

                    -- Student Profile
                    INSERT INTO public.profiles (id, full_name, role, phone)
                    VALUES (
                        v_student_id,
                        'Student ' || hostel_codes[h_idx] || '-' || lpad(s_idx::text, 2, '0'),
                        'student',
                        '+91 98333' || lpad((h_idx * 100 + s_idx)::text, 5, '0')
                    )
                    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;

                    -- Room Allocation
                    INSERT INTO public.room_allocations (room_id, student_id, allocated_date, status)
                    VALUES (v_room_id, v_student_id, CURRENT_DATE - (s_idx * 2), 'active');

                    -- Sample Fee Payment Record
                    INSERT INTO public.fee_payments (student_id, amount, due_date, paid_date, status, recorded_by)
                    VALUES (
                        v_student_id,
                        15000.00,
                        CURRENT_DATE + 30,
                        CASE WHEN (s_idx % 3 = 0) THEN CURRENT_DATE - 5 ELSE NULL END,
                        CASE WHEN (s_idx % 3 = 0) THEN 'paid' WHEN (s_idx % 5 = 0) THEN 'overdue' ELSE 'due' END,
                        v_admin_1
                    );

                    -- Sample Leave Request for some students
                    IF s_idx % 10 = 0 THEN
                        INSERT INTO public.leave_requests (student_id, from_date, to_date, reason, status, reviewed_by)
                        VALUES (
                            v_student_id,
                            CURRENT_DATE + 2,
                            CURRENT_DATE + 6,
                            'Attending family function',
                            'approved',
                            v_primary_warden
                        );
                    END IF;

                    -- Sample Complaint for some students
                    IF s_idx % 12 = 0 THEN
                        INSERT INTO public.complaints (student_id, room_id, category, description, status)
                        VALUES (
                            v_student_id,
                            v_room_id,
                            CASE WHEN s_idx % 2 = 0 THEN 'maintenance' ELSE 'cleanliness' END,
                            'Water heater thermostat issue in room ' || v_room_number,
                            'open'
                        );
                    END IF;

                    s_idx := s_idx + 1;
                END LOOP;
            END LOOP;
        END LOOP;

        -- 6. SAMPLE ANNOUNCEMENTS PER HOSTEL
        INSERT INTO public.announcements (hostel_id, posted_by, title, message)
        VALUES 
            (hostel_ids[h_idx], v_admin_1, 'Welcome to ' || hostel_names[h_idx], 'All 50 residents are requested to verify their room inventory and report any issues within 48 hours.'),
            (hostel_ids[h_idx], v_admin_1, 'Maintenance Inspection Notice', 'Regular plumbing and electrical safety inspection scheduled for this weekend.');
    END LOOP;

    RAISE NOTICE 'Successfully seeded 4 Hostels with 5 Wardens each, 3 Admins, and 50 Students in each hostel (200 total students).';
END $$;
