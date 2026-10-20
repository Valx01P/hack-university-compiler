package dev.hackuniversity.shopfront.common;

import java.util.Map;

/** The request clashes with the current state: a taken email, no stock left, an order already shipped. Answers 409. */
public class ConflictException extends ShopException {

    public ConflictException(String title, String detail) {
        super(title, detail, Map.of());
    }

    public ConflictException(String title, String detail, Map<String, ?> properties) {
        super(title, detail, properties);
    }
}
