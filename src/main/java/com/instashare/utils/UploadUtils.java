package com.instashare.utils;

import java.util.Random;

public class UploadUtils {

    private static final Random random = new Random();

    public static int generateCode() {
        return 10000 + random.nextInt(55535);
    }
}
