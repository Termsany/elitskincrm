-- The accounts moved to the finance app; the sales hub counts every Daftra invoice again (books start cleared).
UPDATE fin_settings SET books_start = NULL WHERE id = 1;
