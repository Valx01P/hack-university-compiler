package dev.hackuniversity.shopfront.order;

import dev.hackuniversity.shopfront.auth.CurrentUser;
import dev.hackuniversity.shopfront.order.dto.OrderResponse;
import dev.hackuniversity.shopfront.order.dto.OrderSummary;
import dev.hackuniversity.shopfront.order.dto.PlaceOrderRequest;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.data.web.PagedModel;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Web layer: a customer's orders over HTTP. Spring passes in the Authentication that the
 * bearer token produced, and the controller hands the service only what it needs from it.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    @PostMapping
    public ResponseEntity<OrderResponse> place(@Valid @RequestBody PlaceOrderRequest request, Authentication user) {
        OrderResponse order = orders.placeOrder(user.getName(), request);
        return ResponseEntity.created(URI.create("/api/orders/" + order.id())).body(order);
    }

    // The caller's own orders, newest first.
    @GetMapping
    public PagedModel<OrderSummary> mine(Authentication user, @PageableDefault(size = 10) Pageable pageable) {
        return new PagedModel<>(orders.listFor(user.getName(), pageable));
    }

    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable long id, Authentication user) {
        return orders.get(id, CurrentUser.of(user));
    }

    @PostMapping("/{id}/cancel")
    public OrderResponse cancel(@PathVariable long id, Authentication user) {
        return orders.cancel(id, CurrentUser.of(user));
    }
}
