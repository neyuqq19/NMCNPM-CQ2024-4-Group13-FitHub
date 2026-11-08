-- Server-assigned human-readable codes. nextval is safe across concurrent creates.
CREATE SEQUENCE fithub_member_code_seq START WITH 1000;
SELECT setval('fithub_member_code_seq', GREATEST(999, COALESCE((SELECT MAX(substring("memberCode" from 3)::bigint) FROM "MemberProfile" WHERE "memberCode" ~ '^HV[0-9]{1,12}$'), 999)));
