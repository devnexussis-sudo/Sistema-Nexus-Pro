DO $$ 
BEGIN
    RAISE NOTICE 'Orders: scheduled_date is type %', 
        (SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'scheduled_date');
END $$;
