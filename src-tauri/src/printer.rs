#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    pub type Handle = isize;

    const PRINTER_ENUM_LOCAL: u32 = 2;
    const PRINTER_ENUM_CONNECTIONS: u32 = 4;

    #[repr(C)]
    struct DocInfo1 {
        doc_name: *const u16,
        output_file: *const u16,
        datatype: *const u16,
    }

    #[repr(C)]
    struct PrinterInfo4 {
        printer_name: *const u16,
        server_name: *const u16,
        attributes: u32,
    }

    #[repr(C)]
    struct PrinterInfo2 {
        server_name: *const u16,
        printer_name: *const u16,
        share_name: *const u16,
        port_name: *const u16,
        driver_name: *const u16,
        comment: *const u16,
        location: *const u16,
        devmode: *const c_void,
        sep_file: *const u16,
        print_processor: *const u16,
        datatype: *const u16,
        parameters: *const u16,
        security_descriptor: *const c_void,
        attributes: u32,
        priority: u32,
        default_priority: u32,
        start_time: u32,
        until_time: u32,
        status: u32,
        jobs: u32,
        average_ppm: u32,
    }

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(name: *const u16, handle: *mut Handle, defaults: *mut c_void) -> i32;
        fn ClosePrinter(handle: Handle) -> i32;
        fn StartDocPrinterW(handle: Handle, level: u32, info: *const DocInfo1) -> u32;
        fn EndDocPrinter(handle: Handle) -> i32;
        fn StartPagePrinter(handle: Handle) -> i32;
        fn EndPagePrinter(handle: Handle) -> i32;
        fn WritePrinter(handle: Handle, buf: *const c_void, count: u32, written: *mut u32) -> i32;
        fn GetPrinterW(handle: Handle, level: u32, buf: *mut u8, size: u32, needed: *mut u32) -> i32;
        fn EnumPrintersW(
            flags: u32,
            name: *const u16,
            level: u32,
            buf: *mut u8,
            size: u32,
            needed: *mut u32,
            returned: *mut u32,
        ) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetLastError() -> u32;
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn from_wide(ptr: *const u16) -> String {
        if ptr.is_null() {
            return String::new();
        }
        let mut len = 0usize;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
    }

    fn fail(step: &str) -> String {
        format!("{step} gagal (kode {})", unsafe { GetLastError() })
    }

    pub fn list() -> Result<Vec<String>, String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed = 0u32;
        let mut returned = 0u32;

        unsafe {
            EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut returned);
        }
        if needed == 0 {
            return Ok(Vec::new());
        }

        let mut buf = vec![0u64; (needed as usize + 7) / 8];
        let ok = unsafe {
            EnumPrintersW(
                flags,
                std::ptr::null(),
                4,
                buf.as_mut_ptr() as *mut u8,
                needed,
                &mut needed,
                &mut returned,
            )
        };
        if ok == 0 {
            return Err(fail("EnumPrinters"));
        }

        let items = unsafe {
            std::slice::from_raw_parts(buf.as_ptr() as *const PrinterInfo4, returned as usize)
        };
        Ok(items.iter().map(|i| unsafe { from_wide(i.printer_name) }).collect())
    }

    const STATUS_FLAGS: [(u32, &str); 12] = [
        (0x00000001, "dijeda"),
        (0x00000002, "error"),
        (0x00000008, "kertas macet"),
        (0x00000010, "kertas habis"),
        (0x00000040, "penutup terbuka"),
        (0x00000080, "offline"),
        (0x00000200, "tidak ada kertas"),
        (0x00001000, "tidak tersedia"),
        (0x00040000, "tinta habis"),
        (0x00100000, "perlu tindakan operator"),
        (0x00200000, "memori penuh"),
        (0x00400000, "penutup printer terbuka"),
    ];

    const BLOCKING: u32 = 0x00000002 | 0x00000008 | 0x00000010 | 0x00000080 | 0x00000200 | 0x00001000 | 0x00100000;

    pub fn describe(status: u32) -> String {
        let parts: Vec<&str> = STATUS_FLAGS
            .iter()
            .filter(|(bit, _)| status & bit != 0)
            .map(|(_, label)| *label)
            .collect();
        if parts.is_empty() {
            "siap".into()
        } else {
            parts.join(", ")
        }
    }

    pub fn is_blocked(status: u32) -> bool {
        status & BLOCKING != 0
    }

    pub fn status(printer: &str) -> Result<(u32, u32), String> {
        let name = wide(printer);
        let mut handle: Handle = 0;
        if unsafe { OpenPrinterW(name.as_ptr(), &mut handle, std::ptr::null_mut()) } == 0 {
            return Err(fail(&format!("OpenPrinter '{printer}'")));
        }

        let mut needed = 0u32;
        unsafe { GetPrinterW(handle, 2, std::ptr::null_mut(), 0, &mut needed) };
        if needed == 0 {
            let err = fail("GetPrinter");
            unsafe { ClosePrinter(handle) };
            return Err(err);
        }

        let mut buf = vec![0u64; (needed as usize + 7) / 8];
        let ok = unsafe { GetPrinterW(handle, 2, buf.as_mut_ptr() as *mut u8, needed, &mut needed) };
        let result = if ok == 0 {
            Err(fail("GetPrinter"))
        } else {
            let info = unsafe { &*(buf.as_ptr() as *const PrinterInfo2) };
            Ok((info.status, info.jobs))
        };

        unsafe { ClosePrinter(handle) };
        result
    }

    pub fn print_raw(printer: &str, data: &[u8]) -> Result<(), String> {
        if data.is_empty() {
            return Err("data kosong".into());
        }

        let (state, _) = status(printer)?;
        if is_blocked(state) {
            return Err(format!("Printer {printer}: {}", describe(state)));
        }

        let name = wide(printer);
        let mut handle: Handle = 0;
        if unsafe { OpenPrinterW(name.as_ptr(), &mut handle, std::ptr::null_mut()) } == 0 {
            return Err(fail(&format!("OpenPrinter '{printer}'")));
        }

        let doc_name = wide("Polaris Struk");
        let datatype = wide("RAW");
        let info = DocInfo1 {
            doc_name: doc_name.as_ptr(),
            output_file: std::ptr::null(),
            datatype: datatype.as_ptr(),
        };

        if unsafe { StartDocPrinterW(handle, 1, &info) } == 0 {
            let err = fail("StartDocPrinter");
            unsafe { ClosePrinter(handle) };
            return Err(err);
        }
        if unsafe { StartPagePrinter(handle) } == 0 {
            let err = fail("StartPagePrinter");
            unsafe {
                EndDocPrinter(handle);
                ClosePrinter(handle);
            }
            return Err(err);
        }

        let mut written = 0u32;
        let ok = unsafe {
            WritePrinter(handle, data.as_ptr() as *const c_void, data.len() as u32, &mut written)
        };
        let err = if ok == 0 { Some(fail("WritePrinter")) } else { None };

        unsafe {
            EndPagePrinter(handle);
            EndDocPrinter(handle);
            ClosePrinter(handle);
        }

        if let Some(err) = err {
            return Err(err);
        }
        if written as usize != data.len() {
            return Err(format!("hanya {written} dari {} byte terkirim", data.len()));
        }
        Ok(())
    }
}

#[tauri::command]
pub fn list_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        win::list()
    }
    #[cfg(not(windows))]
    {
        Err("printer hanya didukung di Windows".into())
    }
}

#[derive(serde::Serialize)]
pub struct PrinterState {
    pub ready: bool,
    pub message: String,
    pub jobs: u32,
}

#[tauri::command]
pub fn printer_status(printer: String) -> Result<PrinterState, String> {
    #[cfg(windows)]
    {
        let (status, jobs) = win::status(&printer)?;
        Ok(PrinterState {
            ready: !win::is_blocked(status),
            message: win::describe(status),
            jobs,
        })
    }
    #[cfg(not(windows))]
    {
        let _ = printer;
        Err("printer hanya didukung di Windows".into())
    }
}

#[tauri::command]
pub fn print_raw(printer: String, data: Vec<u8>) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::print_raw(&printer, &data)
    }
    #[cfg(not(windows))]
    {
        let _ = (printer, data);
        Err("printer hanya didukung di Windows".into())
    }
}
