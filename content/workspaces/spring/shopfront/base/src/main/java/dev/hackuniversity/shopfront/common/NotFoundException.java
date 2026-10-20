package dev.hackuniversity.shopfront.common;

import java.util.Map;

/** The thing asked for does not exist, or the caller may not know it exists. Answers 404. */
public class NotFoundException extends ShopException {

    public NotFoundException(String title, String detail) {
        super(title, detail, Map.of());
    }
}
