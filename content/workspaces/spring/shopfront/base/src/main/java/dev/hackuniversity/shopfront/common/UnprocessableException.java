package dev.hackuniversity.shopfront.common;

import java.util.Map;

/**
 * The request is well formed but refers to something the shop cannot use, like an unknown
 * SKU or category. Answers 422. A request with the wrong shape fails validation (400) first.
 */
public class UnprocessableException extends ShopException {

    public UnprocessableException(String title, String detail, Map<String, ?> properties) {
        super(title, detail, properties);
    }
}
