package dev.hackuniversity.shopfront.common;

import java.util.Map;

/**
 * A business rule said no. Services throw one of the three subclasses (NotFoundException,
 * ConflictException, UnprocessableException), and ApiExceptionHandler turns it into a problem
 * response: the title, the message as its detail, and the properties as extra fields.
 */
public abstract class ShopException extends RuntimeException {

    private final String title;
    private final Map<String, Object> properties;

    protected ShopException(String title, String detail, Map<String, ?> properties) {
        super(detail);
        this.title = title;
        this.properties = Map.copyOf(properties);
    }

    public String getTitle() {
        return title;
    }

    public Map<String, Object> getProperties() {
        return properties;
    }
}
