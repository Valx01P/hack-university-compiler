package dev.hackuniversity.shopfront.catalog;

import dev.hackuniversity.shopfront.common.ConflictException;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.Map;

/**
 * Domain model: something the shop sells, a row of the products table. Prices are whole cents
 * (a long), never floating point. Stock only changes through removeStock and addStock, which
 * keep it from going below zero.
 */
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String sku;

    private String name;

    private String description;

    private long priceCents;

    private int stock;

    private boolean active;

    // LAZY: loading a product does not load its category unless a query asks for it.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id")
    private Category category;

    // Optimistic locking: every UPDATE says "and version = ?" and bumps it, so when two
    // transactions read the same stock and both try to sell it, the second one fails.
    @Version
    private long version;

    protected Product() {
        // for JPA
    }

    public Product(String sku, String name, String description, long priceCents, int stock, Category category) {
        this.sku = sku;
        this.name = name;
        this.description = description;
        this.priceCents = priceCents;
        this.stock = stock;
        this.category = category;
        this.active = true;
    }

    public void update(String name, String description, long priceCents, int stock, Category category, boolean active) {
        this.name = name;
        this.description = description;
        this.priceCents = priceCents;
        this.stock = stock;
        this.category = category;
        this.active = active;
    }

    /** Hidden from the catalog and from new orders, but kept, because past orders point at it. */
    public void deactivate() {
        this.active = false;
    }

    public void removeStock(int quantity) {
        if (quantity > stock) {
            throw new ConflictException("Out of stock",
                    "Only %d left of %s, not %d.".formatted(stock, sku, quantity), Map.of("sku", sku));
        }
        stock -= quantity;
    }

    public void addStock(int quantity) {
        stock += quantity;
    }

    public Long getId() {
        return id;
    }

    public String getSku() {
        return sku;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public long getPriceCents() {
        return priceCents;
    }

    public int getStock() {
        return stock;
    }

    public boolean isActive() {
        return active;
    }

    public Category getCategory() {
        return category;
    }

    public long getVersion() {
        return version;
    }
}
